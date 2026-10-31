import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../stats/stats_providers.dart';
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

/// Whether the last call reached the server. The record tab shows an offline banner while it did not.
final networkStatusProvider = NotifierProvider<NetworkStatus, bool>(
  NetworkStatus.new,
);

class NetworkStatus extends Notifier<bool> {
  @override
  bool build() => true;

  void reached() => state = true;

  void unreachable() => state = false;
}

/// The person's payday when their month starts on it; null when it does not, or when the profile cannot be read
/// (the month then runs from the 1st, as on the web without a profile).
final salaryDayProvider = FutureProvider<int?>((ref) async {
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
    final page = await ref.watch(ledgerApiProvider).list(limit: pageSize);
    return LedgerListState(entries: page.entries, total: page.total);
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

/// Reloads everything that shows the ledger after a save, a deletion or an undo.
void refreshLedger(WidgetRef ref) {
  ref
    ..invalidate(monthSummaryProvider)
    ..invalidate(recentEntriesProvider)
    ..invalidate(allEntriesProvider)
    ..invalidate(monthStatsByMonthProvider)
    ..invalidate(monthStatsProvider);
}
