import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import '../stats/stats_providers.dart';
import '../wallets/wallet_providers.dart';
import 'ledger_api.dart';
import 'ledger_models.dart';
import 'offline/ledger_store.dart';

final ledgerApiProvider = Provider<LedgerApi>(
  (ref) => LedgerApi(ref.watch(trpcClientProvider)),
);

/// Where the phone keeps the outbox and the offline copy of the ledger. Tests replace it with a [MemoryLedgerStore].
final ledgerStoreProvider = Provider<LedgerStore>(
  (ref) => FileLedgerStore(getApplicationSupportDirectory),
);

final localLedgerProvider = Provider<LocalLedger>(
  (ref) => LocalLedger(ref.watch(ledgerStoreProvider)),
);

/// Who owns cached ledger answers right now: signing out or switching accounts resets providers watching it.
final _ledgerSessionScopeProvider =
    Provider<({bool signedIn, String? accountKey})>(
      (ref) => switch (ref.watch(sessionProvider)) {
        SignedIn(:final user?) => (
          signedIn: true,
          accountKey: '${user.kind.name}:${user.id}',
        ),
        SignedIn() => (signedIn: true, accountKey: null),
        _ => (signedIn: false, accountKey: null),
      },
    );

/// Whether the last call reached the server. Screens show an offline banner while it did not.
final networkStatusProvider = NotifierProvider<NetworkStatus, bool>(
  NetworkStatus.new,
);

class NetworkStatus extends Notifier<bool> {
  @override
  bool build() => true;

  void reached() => state = true;

  void unreachable() => state = false;
}

/// Entry ids hidden across every list while their undoable deletion notice is open.
final hiddenEntryIdsProvider = NotifierProvider<HiddenIds, Set<int>>(
  HiddenIds.new,
);

/// Pending clarification ids hidden while their undoable dismissal notice is open.
final hiddenClarificationIdsProvider = NotifierProvider<HiddenIds, Set<int>>(
  HiddenIds.new,
);

class HiddenIds extends Notifier<Set<int>> {
  @override
  Set<int> build() {
    ref.watch(_ledgerSessionScopeProvider);
    return const {};
  }

  void hide(int id) => state = {...state, id};

  void restore(int id) {
    if (!state.contains(id)) return;
    state = {
      for (final item in state)
        if (item != id) item,
    };
  }
}

/// The person's payday when their month starts on it; null when it does not, or when the profile cannot be read
/// (the month then runs from the 1st, as on the web without a profile).
final salaryDayProvider = FutureProvider<int?>((ref) async {
  final scope = ref.watch(_ledgerSessionScopeProvider);
  if (!scope.signedIn) return null;
  try {
    return await ref.watch(ledgerApiProvider).salaryDay();
  } on Object {
    return null;
  }
});

/// The month shown on the record tab, "2026-10", from the phone's date and the payday.
final currentMonthProvider = FutureProvider<String>((ref) async {
  final salaryDay = await ref.watch(salaryDayProvider.future);
  return currentMonthKey(clock.now(), salaryDay: salaryDay);
});

/// The month's totals; without a network, the last ones seen for the same month.
final monthSummaryProvider = FutureProvider<MonthSummary>((ref) async {
  final month = await ref.watch(currentMonthProvider.future);
  final salaryDay = await ref.watch(salaryDayProvider.future);
  final local = ref.watch(localLedgerProvider);
  try {
    final summary = await ref
        .watch(ledgerApiProvider)
        .monthSummary(month, salaryDay: salaryDay);
    ref.read(networkStatusProvider.notifier).reached();
    unawaited(
      local.update(
        (stored) => stored.copyWith(summaryMonth: month, summary: summary),
      ),
    );
    return summary;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    final stored = await local.snapshot();
    if (stored.summaryMonth == month && stored.summary != null) {
      return stored.summary!;
    }
    rethrow;
  }
});

/// The latest transactions on the record tab; without a network, the last ones seen.
final recentEntriesProvider = FutureProvider<LedgerPage>((ref) async {
  final local = ref.watch(localLedgerProvider);
  try {
    final page = await ref.watch(ledgerApiProvider).list(limit: 10);
    ref.read(networkStatusProvider.notifier).reached();
    unawaited(local.update((stored) => stored.copyWith(recent: page)));
    return page;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    final cached = (await local.snapshot()).recent;
    if (cached != null) return cached;
    rethrow;
  }
});

/// One transaction's full row (`expense.getById`), or null when it was deleted elsewhere. Without a network, falls
/// back to any row already loaded or cached on this phone for the same account.
final transactionDetailProvider = FutureProvider.family<LedgerEntry?, int>((
  ref,
  id,
) async {
  final scope = ref.watch(_ledgerSessionScopeProvider);
  if (!scope.signedIn) return null;
  try {
    final entry = await ref.watch(ledgerApiProvider).getById(id);
    ref.read(networkStatusProvider.notifier).reached();
    return entry;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    for (final list in [
      ref.read(allEntriesProvider).value?.entries,
      ref.read(recentEntriesProvider).value?.entries,
    ]) {
      final hit = list?.where((entry) => entry.id == id).firstOrNull;
      if (hit != null) return hit;
    }
    final stored = await ref.read(localLedgerProvider).snapshot();
    final sameAccount =
        scope.accountKey == null ||
        stored.accountKey == null ||
        stored.accountKey == scope.accountKey;
    if (sameAccount) {
      final hit = stored.recent?.entries
          .where((entry) => entry.id == id)
          .firstOrNull;
      if (hit != null) return hit;
    }
    rethrow;
  }
});

/// The people saved on this account (`profile.listContacts`).
final contactsProvider = FutureProvider<List<ContactSummary>>((ref) async {
  final scope = ref.watch(_ledgerSessionScopeProvider);
  if (!scope.signedIn) return const [];
  return ref.watch(ledgerApiProvider).contacts();
});

/// The person's custom categories (`expense.getCategoryList`).
final customCategoriesProvider = FutureProvider<List<String>>((ref) async {
  final scope = ref.watch(_ledgerSessionScopeProvider);
  if (!scope.signedIn) return const [];
  return ref.watch(ledgerApiProvider).customCategories();
});

/// Sentences waiting on the server for an answer (`expense.getPendingClarifications`).
final pendingClarificationsProvider =
    FutureProvider<List<PendingClarification>>((ref) async {
      final scope = ref.watch(_ledgerSessionScopeProvider);
      if (!scope.signedIn) return const [];
      try {
        final items = await ref
            .watch(ledgerApiProvider)
            .pendingClarifications();
        ref.read(networkStatusProvider.notifier).reached();
        return items;
      } on ApiNetworkException {
        ref.read(networkStatusProvider.notifier).unreachable();
        rethrow;
      }
    });

/// Identifies a linked person when listing their transactions.
typedef PersonTransactionsQuery = ({int contactId, String name});

/// Transactions linked to one person, combining rows with `contactId` in the latest 100 transactions and text matches
/// from `expense.searchTransactions` whose `contactId` is either this person or unset.
final personTransactionsProvider =
    FutureProvider.family<List<LedgerEntry>, PersonTransactionsQuery>((
      ref,
      query,
    ) async {
      final scope = ref.watch(_ledgerSessionScopeProvider);
      if (!scope.signedIn) return const [];
      final api = ref.watch(ledgerApiProvider);
      final (recentPage, searched) = await (
        api.list(limit: 100),
        api.searchTransactions(query.name),
      ).wait;
      final byId = <int, LedgerEntry>{};
      for (final entry in recentPage.entries) {
        if (entry.contactId == query.contactId) {
          byId[entry.id] = entry;
        }
      }
      for (final entry in searched) {
        if (entry.contactId == query.contactId || entry.contactId == null) {
          byId.putIfAbsent(entry.id, () => entry);
        }
      }
      final combined = byId.values.toList()
        ..sort((a, b) => b.date.compareTo(a.date));
      return combined;
    });

/// Every transaction, a page at a time, for the full list.
final allEntriesProvider = AsyncNotifierProvider<AllEntries, LedgerListState>(
  AllEntries.new,
);

/// The full list so far, and whether more pages remain.
final class LedgerListState {
  const LedgerListState({
    required this.entries,
    required this.total,
    this.loadingMore = false,
  });

  final List<LedgerEntry> entries;
  final int total;
  final bool loadingMore;

  bool get hasMore => entries.length < total;

  LedgerListState copyWith({
    List<LedgerEntry>? entries,
    int? total,
    bool? loadingMore,
  }) => LedgerListState(
    entries: entries ?? this.entries,
    total: total ?? this.total,
    loadingMore: loadingMore ?? this.loadingMore,
  );
}

class AllEntries extends AsyncNotifier<LedgerListState> {
  static const pageSize = 30;

  @override
  Future<LedgerListState> build() async {
    try {
      final page = await ref.watch(ledgerApiProvider).list(limit: pageSize);
      return LedgerListState(entries: page.entries, total: page.total);
    } on ApiNetworkException {
      final cached = (await ref.read(localLedgerProvider).snapshot()).recent;
      if (cached != null && cached.entries.isNotEmpty) {
        return LedgerListState(entries: cached.entries, total: cached.total);
      }
      rethrow;
    }
  }

  /// Loads the next page after the last entry shown.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore) return;
    state = AsyncData(current.copyWith(loadingMore: true));
    try {
      final page = await ref
          .read(ledgerApiProvider)
          .list(limit: pageSize, before: current.entries.last.id);
      state = AsyncData(
        current.copyWith(
          entries: [...current.entries, ...page.entries],
          total: page.total,
          loadingMore: false,
        ),
      );
    } on Object {
      state = AsyncData(current.copyWith(loadingMore: false));
    }
  }

  /// Takes [entry] off the list while its deletion can still be undone.
  void hide(LedgerEntry entry) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        entries: [
          for (final shown in current.entries)
            if (shown.id != entry.id) shown,
        ],
        total: current.total - 1,
      ),
    );
  }

  /// Puts [entry] back where it belongs, newest first, after an undo or a failed deletion.
  void restore(LedgerEntry entry) {
    final current = state.value;
    if (current == null || current.entries.any((e) => e.id == entry.id)) {
      return;
    }
    final entries = [...current.entries, entry]
      ..sort((a, b) => b.id.compareTo(a.id));
    state = AsyncData(
      current.copyWith(entries: entries, total: current.total + 1),
    );
  }
}

/// Reloads everything that shows the ledger after a save, an edit, a deletion or an undo.
void refreshLedger(WidgetRef ref) {
  ref
    ..invalidate(monthSummaryProvider)
    ..invalidate(recentEntriesProvider)
    ..invalidate(allEntriesProvider)
    ..invalidate(transactionDetailProvider)
    ..invalidate(personTransactionsProvider)
    ..invalidate(contactsProvider)
    ..invalidate(pendingClarificationsProvider)
    ..invalidate(monthStatsByMonthProvider)
    ..invalidate(monthStatsProvider)
    ..invalidate(categoryTransactionsProvider)
    ..invalidate(walletsProvider)
    ..invalidate(walletDetailProvider);
}

/// Same as [refreshLedger] for callbacks that outlive the screen that started them (such as an undo snackbar after
/// popping a detail route).
void invalidateLedgerContainer(ProviderContainer container) {
  container
    ..invalidate(monthSummaryProvider)
    ..invalidate(recentEntriesProvider)
    ..invalidate(allEntriesProvider)
    ..invalidate(transactionDetailProvider)
    ..invalidate(personTransactionsProvider)
    ..invalidate(contactsProvider)
    ..invalidate(pendingClarificationsProvider)
    ..invalidate(monthStatsByMonthProvider)
    ..invalidate(monthStatsProvider)
    ..invalidate(categoryTransactionsProvider)
    ..invalidate(walletsProvider)
    ..invalidate(walletDetailProvider);
}
