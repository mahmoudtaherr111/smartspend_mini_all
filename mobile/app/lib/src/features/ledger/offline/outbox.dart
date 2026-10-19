import 'dart:async';

import 'package:clock/clock.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../auth/session_controller.dart';
import '../ledger_models.dart';
import '../ledger_providers.dart';
import 'ledger_store.dart';
import 'offline_rules.dart';

/// Whether the phone has a network at all. It cannot promise the internet works (a café's login page), so a
/// failed call still counts as offline; it only says when to try again.
final connectivityProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  bool connected(List<ConnectivityResult> results) =>
      results.any((result) => result != ConnectivityResult.none);
  yield connected(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(connected);
});

/// How long the outbox waits before trying again after the network failed, longer each time. Tests use none.
final outboxRetryDelaysProvider = Provider<List<Duration>>(
  (ref) => const [
    Duration(seconds: 15),
    Duration(seconds: 30),
    Duration(minutes: 1),
    Duration(minutes: 2),
    Duration(minutes: 5),
  ],
);

final outboxProvider = AsyncNotifierProvider<Outbox, OutboxView>(Outbox.new);

/// The outbox as screens show it.
final class OutboxView {
  const OutboxView({this.items = const []});

  final List<OutboxItem> items;
}

/// What happened to a sentence the person just sent.
sealed class SubmitOutcome {
  const SubmitOutcome();
}

/// In the ledger: [ids] can be deleted to undo it.
final class SubmitSaved extends SubmitOutcome {
  const SubmitSaved(this.items, this.ids, {required this.automatic});
  final List<ParsedItem> items;
  final List<int> ids;

  /// Saved without asking, because the server was sure.
  final bool automatic;
}

/// Read; waits for the person to look at [OutboxItem.parse] and agree.
final class SubmitNeedsReview extends SubmitOutcome {
  const SubmitNeedsReview(this.item);
  final OutboxItem item;
}

/// Read; waits for the person's answer to the server's question.
final class SubmitNeedsAnswer extends SubmitOutcome {
  const SubmitNeedsAnswer(this.item);
  final OutboxItem item;
}

/// Kept on the phone until the network returns.
final class SubmitQueued extends SubmitOutcome {
  const SubmitQueued();
}

/// Not kept: offline and not a sentence worth keeping, or the outbox is full.
final class SubmitRefused extends SubmitOutcome {
  const SubmitRefused({this.reason, this.fullAt});
  final OfflineRefusal? reason;

  /// The plan's offline limit, when the outbox is full.
  final int? fullAt;
}

/// The server refused it; the sentence stays in the composer.
final class SubmitFailed extends SubmitOutcome {
  const SubmitFailed(this.message);
  final String message;
}

/// The read was fine but held nothing to save.
final class SubmitEmpty extends SubmitOutcome {
  const SubmitEmpty();
}

/// Every sentence goes through the outbox (docs/decisions/0022-flutter-mobile-app.md, point 6): it is stored on the
/// phone first, then read and saved in the order it was written. Without a network it waits and is sent when the
/// network returns, the app comes back to the foreground, or a retry timer fires; its save always carries the
/// sentence's own request id, so a save repeated after a lost answer is stored once. Signing out empties the
/// outbox, and another account signing in on the phone never sends the previous one's sentences, as the web does.
class Outbox extends AsyncNotifier<OutboxView> {
  /// The send in progress, which every caller of [flush] shares, so sentences go out one at a time.
  Future<void>? _flushing;
  bool _offline = false;
  int _failures = 0;
  Timer? _retry;
  AppLifecycleListener? _lifecycle;

  LocalLedger get _local => ref.read(localLedgerProvider);

  @override
  Future<OutboxView> build() async {
    ref.onDispose(() {
      _retry?.cancel();
      _lifecycle?.dispose();
    });
    _lifecycle = AppLifecycleListener(onResume: () => unawaited(flush()));
    ref.listen(sessionProvider, (_, session) => unawaited(_follow(session)));
    ref.listen(connectivityProvider, (_, connected) {
      if (connected.value == true) unawaited(flush());
    });
    await _follow(ref.read(sessionProvider));
    // How many sentences may wait offline, known before the network is ever lost.
    if (ref.read(sessionProvider) is SignedIn) {
      unawaited(_rememberOfflineLimit());
    }
    final ledger = await _local.snapshot();
    if (ledger.outbox.any((item) => item.state == OutboxState.queued)) {
      unawaited(Future.microtask(flush));
    }
    return OutboxView(items: ledger.outbox);
  }

  /// Keeps the outbox to the account signed in now.
  Future<void> _follow(SessionState session) async {
    switch (session) {
      case SignedOut(expired: false):
        await _local.wipe();
        _publish(const []);
      case SignedIn(:final user?):
        final key = '${user.kind.name}:${user.id}';
        final ledger = await _local.snapshot();
        if (ledger.accountKey != null && ledger.accountKey != key) {
          await _local.wipe();
          _publish(const []);
        }
        if (ledger.accountKey != key) {
          await _local.update((stored) => stored.copyWith(accountKey: key));
        }
      default:
      // Restoring, signed in before the server named the user, or a session that expired: the same person
      // usually signs back in, so the outbox waits.
    }
  }

  /// Records [text]: stored first, then read at once when the network allows. Earlier sentences still waiting
  /// are sent before it.
  Future<SubmitOutcome> submit(String text) async {
    final api = ref.read(ledgerApiProvider);
    // Stored as already being sent, so a send in progress leaves it to the person who wrote it: they review it or
    // answer for it now. Read back after a restart, it is queued again.
    final item = OutboxItem(
      id: api.newRequestId(),
      text: text,
      createdAt: clock.now(),
      state: OutboxState.sending,
    );
    await _change((items) => [...items, item]);
    // Older sentences go first.
    await flush();
    if (_offline || ref.read(connectivityProvider).value == false) {
      return _keepOffline(item);
    }
    final outcome = await _process(item, interactive: true);
    // The network failed on this very sentence: the offline rules decide whether it may wait.
    return outcome is SubmitQueued ? _keepOffline(item) : outcome;
  }

  /// Sends what waits in the outbox, oldest first, until the network fails. A call while a send is in progress
  /// waits for that send instead of starting a second one.
  Future<void> flush() {
    if (ref.read(sessionProvider) is! SignedIn) return Future.value();
    return _flushing ??= _drain().whenComplete(() => _flushing = null);
  }

  Future<void> _drain() async {
    _offline = false;
    while (true) {
      final ledger = await _local.snapshot();
      final next = ledger.outbox
          .where((item) => item.state == OutboxState.queued)
          .firstOrNull;
      if (next == null) break;
      final outcome = await _process(next, interactive: false);
      if (outcome is SubmitQueued) break;
    }
  }

  /// Saves a sentence the person reviewed and agreed to. Returns the ids to undo it with.
  Future<List<int>> confirm(OutboxItem item) async {
    final parse = item.parse;
    final items = [...?parse?.items.where((entry) => entry.isSavable)];
    final ids = await ref
        .read(ledgerApiProvider)
        .save(
          items,
          rawText: item.text,
          classificationLogId: parse?.classificationLogId,
          requestId: item.id,
        );
    await _remove(item.id);
    _refreshLedger();
    return ids;
  }

  /// Sends the person's answer to the server's question about [item]. The sentence leaves the outbox once
  /// it is saved; another question keeps it waiting with that question.
  Future<ClarificationResult> answer(OutboxItem item, String answer) async {
    final clarificationId = item.parse?.clarificationId;
    if (clarificationId == null) {
      throw StateError('No question to answer for ${item.id}');
    }
    final result = await ref
        .read(ledgerApiProvider)
        .answer(clarificationId, answer);
    if (result.nextQuestion == null) {
      await _remove(item.id);
      _refreshLedger();
    } else {
      final parse = item.parse!;
      await _replace(
        item.copyWith(
          state: OutboxState.needsYou,
          parse: ParseResult(
            decision: ParseDecision.clarify,
            items: parse.items,
            clarificationQuestion: result.nextQuestion,
            clarificationId: result.clarificationId ?? clarificationId,
            classificationLogId: parse.classificationLogId,
          ),
        ),
      );
    }
    return result;
  }

  /// Takes [item] out of the outbox without saving it.
  Future<void> discard(OutboxItem item) => _remove(item.id);

  /// Sends a refused sentence again.
  Future<void> retry(OutboxItem item) async {
    await _replace(item.copyWith(state: OutboxState.queued));
    await flush();
  }

  Future<SubmitOutcome> _process(
    OutboxItem item, {
    required bool interactive,
  }) async {
    final api = ref.read(ledgerApiProvider);
    await _replace(item.copyWith(state: OutboxState.sending));
    try {
      final parse = await api.parse(item.text);
      _online();
      switch (parse.decision) {
        case ParseDecision.autoSave:
          final items = parse.items.where((entry) => entry.isSavable).toList();
          if (items.isEmpty) {
            await _remove(item.id);
            return const SubmitEmpty();
          }
          final ids = await api.save(
            items,
            rawText: item.text,
            classificationLogId: parse.classificationLogId,
            requestId: item.id,
          );
          await _remove(item.id);
          _refreshLedger();
          return SubmitSaved(items, ids, automatic: true);
        case ParseDecision.review:
          if (!parse.items.any((entry) => entry.isSavable)) {
            await _remove(item.id);
            return const SubmitEmpty();
          }
          final waiting = item.copyWith(
            state: OutboxState.needsYou,
            parse: parse,
          );
          await _replace(waiting);
          return SubmitNeedsReview(waiting);
        case ParseDecision.clarify:
          final waiting = item.copyWith(
            state: OutboxState.needsYou,
            parse: parse,
          );
          await _replace(waiting);
          return SubmitNeedsAnswer(waiting);
      }
    } on ApiNetworkException {
      await _replace(item.copyWith(state: OutboxState.queued));
      _wentOffline();
      return const SubmitQueued();
    } on ApiException catch (error) {
      if (interactive) {
        // The person is looking: the sentence goes back to the composer with the server's words.
        await _remove(item.id);
      } else {
        await _replace(
          item.copyWith(state: OutboxState.failed, message: error.message),
        );
      }
      return SubmitFailed(error.message);
    }
  }

  /// Offline: keeps [item] when it is a sentence worth keeping and the plan's outbox has room (the web's rules).
  Future<SubmitOutcome> _keepOffline(OutboxItem item) async {
    final refusal = checkOfflineSentence(item.text);
    if (refusal != null) {
      await _remove(item.id);
      return SubmitRefused(reason: refusal);
    }
    final ledger = await _local.snapshot();
    final limit = ledger.offlineLimit ?? 3;
    final waiting = ledger.outbox
        .where(
          (entry) => entry.state == OutboxState.queued && entry.id != item.id,
        )
        .length;
    if (waiting >= limit) {
      await _remove(item.id);
      return SubmitRefused(fullAt: limit);
    }
    await _replace(item.copyWith(state: OutboxState.queued));
    return const SubmitQueued();
  }

  void _online() {
    _failures = 0;
    _retry?.cancel();
    _offline = false;
    ref.read(networkStatusProvider.notifier).reached();
    unawaited(_rememberOfflineLimit());
  }

  void _wentOffline() {
    _offline = true;
    ref.read(networkStatusProvider.notifier).unreachable();
    final delays = ref.read(outboxRetryDelaysProvider);
    if (delays.isEmpty) return;
    _retry?.cancel();
    _retry = Timer(
      delays[_failures.clamp(0, delays.length - 1)],
      () => unawaited(flush()),
    );
    _failures++;
  }

  bool _limitAsked = false;

  /// Asks once per session how many sentences may wait offline, for the next time the network fails.
  Future<void> _rememberOfflineLimit() async {
    if (_limitAsked) return;
    _limitAsked = true;
    try {
      final limit = await ref.read(ledgerApiProvider).offlineLimit();
      if (limit != null) {
        await _local.update((stored) => stored.copyWith(offlineLimit: limit));
      }
    } on Object {
      _limitAsked = false;
    }
  }

  void _refreshLedger() {
    ref
      ..invalidate(monthSummaryProvider)
      ..invalidate(recentEntriesProvider)
      ..invalidate(allEntriesProvider);
  }

  Future<void> _change(
    List<OutboxItem> Function(List<OutboxItem> items) change,
  ) async {
    final ledger = await _local.update(
      (stored) => stored.copyWith(outbox: change(stored.outbox)),
    );
    _publish(ledger.outbox);
  }

  Future<void> _replace(OutboxItem item) => _change(
    (items) => [for (final entry in items) entry.id == item.id ? item : entry],
  );

  Future<void> _remove(String id) => _change(
    (items) => [
      for (final entry in items)
        if (entry.id != id) entry,
    ],
  );

  void _publish(List<OutboxItem> items) =>
      state = AsyncData(OutboxView(items: items));
}
