import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import '../ledger/ledger_api.dart';
import '../ledger/ledger_models.dart';
import '../ledger/ledger_providers.dart';
import 'stats_models.dart';

/// Reads a month's statistics from the server (`expense.getMonthlyStats`).
final class StatsRepository {
  const StatsRepository(this._client);

  final TrpcClient _client;

  Future<MonthStats> month(String month, {int? salaryDay}) async {
    final data = await _client.query(
      Procedures.expense.getMonthlyStats,
      input: {'month': month, 'salaryDay': ?salaryDay},
    );
    if (data is! Map<String, Object?>) {
      throw ApiException(
        code: 'MALFORMED_RESPONSE',
        httpStatus: 200,
        message: friendlyHttpMessage(500),
        path: Procedures.expense.getMonthlyStats.path,
      );
    }
    return MonthStats.fromJson(data);
  }
}

final statsRepositoryProvider = Provider<StatsRepository>(
  (ref) => StatsRepository(ref.watch(trpcClientProvider)),
);

/// Who owns cached statistics right now: signing out or switching to another account resets any provider that
/// watches it, while `me` filling in extra profile fields for the same account does not re-fetch.
final _statsSessionScopeProvider =
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

/// How many months back from the current one the stats tab shows: 0 is the current month.
final statsMonthOffsetProvider = NotifierProvider<StatsMonthOffset, int>(
  StatsMonthOffset.new,
);

class StatsMonthOffset extends Notifier<int> {
  @override
  int build() => 0;

  void previous() => state = state + 1;

  void next() {
    if (state > 0) state = state - 1;
  }
}

/// "2026-10" moved back by [monthsBack] months.
String monthBefore(String month, int monthsBack) {
  final parts = month.split('-').map(int.parse).toList();
  final shifted = DateTime.utc(parts[0], parts[1] - monthsBack);
  return '${shifted.year}-${shifted.month.toString().padLeft(2, '0')}';
}

/// The month the stats tab shows, as a key.
final statsMonthProvider = FutureProvider<String>((ref) async {
  final current = await ref.watch(currentMonthProvider.future);
  return monthBefore(current, ref.watch(statsMonthOffsetProvider));
});

/// Statistics for one [month] ("YYYY-MM"); without a network, the last answer seen for that month on this account.
final monthStatsByMonthProvider = FutureProvider.family<MonthStats, String>((
  ref,
  month,
) async {
  final scope = ref.watch(_statsSessionScopeProvider);
  if (!scope.signedIn) return MonthStats.fromJson(const {});
  final salaryDay = await ref.watch(salaryDayProvider.future);
  final local = ref.watch(localLedgerProvider);
  try {
    final stats = await ref
        .watch(statsRepositoryProvider)
        .month(month, salaryDay: salaryDay);
    ref.read(networkStatusProvider.notifier).reached();
    unawaited(
      local.update(
        (stored) => stored.copyWith(
          accountKey: scope.accountKey ?? stored.accountKey,
          statsByMonth: {...stored.statsByMonth, month: stats},
        ),
      ),
    );
    return stats;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    final stored = await local.snapshot();
    final sameAccount =
        scope.accountKey == null ||
        stored.accountKey == null ||
        stored.accountKey == scope.accountKey;
    final cached = sameAccount ? stored.statsByMonth[month] : null;
    if (cached != null) return cached;
    rethrow;
  }
});

/// The statistics of the month the tab shows.
final monthStatsProvider = FutureProvider<MonthStats>((ref) async {
  final month = await ref.watch(statsMonthProvider.future);
  return ref.watch(monthStatsByMonthProvider(month).future);
});

/// Identifies one category's transactions in one month ("2026-10").
typedef CategoryMonthQuery = ({String category, String month});

/// One category's expense rows in one month (`expense.list`), a page at a time, with optimistic hide/restore for
/// undoable deletion.
final categoryTransactionsProvider =
    AsyncNotifierProvider.family<
      CategoryTransactions,
      LedgerListState,
      CategoryMonthQuery
    >(CategoryTransactions.new);

class CategoryTransactions extends AsyncNotifier<LedgerListState> {
  CategoryTransactions(this.query);

  static const pageSize = 30;
  final CategoryMonthQuery query;

  @override
  Future<LedgerListState> build() async {
    final scope = ref.watch(_statsSessionScopeProvider);
    if (!scope.signedIn) {
      return const LedgerListState(entries: [], total: 0);
    }
    final salaryDay = await ref.watch(salaryDayProvider.future);
    final range = financialMonthDayRange(query.month, salaryDay: salaryDay);
    try {
      final page = await ref
          .watch(ledgerApiProvider)
          .list(
            limit: pageSize,
            category: query.category,
            type: 'expense',
            startDate: range.startDay,
            endDate: '${range.endDay}T23:59:59.999',
          );
      ref.read(networkStatusProvider.notifier).reached();
      return LedgerListState(entries: page.entries, total: page.total);
    } on ApiNetworkException {
      ref.read(networkStatusProvider.notifier).unreachable();
      final stored = await ref.read(localLedgerProvider).snapshot();
      final sameAccount =
          scope.accountKey == null ||
          stored.accountKey == null ||
          stored.accountKey == scope.accountKey;
      final recent = sameAccount ? stored.recent : null;
      if (recent != null) {
        final matching = [
          for (final entry in recent.entries)
            if (entry.type == 'expense' &&
                entry.category == query.category &&
                _inRange(entry.date, range))
              entry,
        ];
        if (matching.isNotEmpty) {
          return LedgerListState(entries: matching, total: matching.length);
        }
      }
      rethrow;
    }
  }

  static bool _inRange(
    DateTime date,
    ({String startDay, String endDay}) range,
  ) {
    final key =
        '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    return key.compareTo(range.startDay) >= 0 &&
        key.compareTo(range.endDay) <= 0;
  }

  /// Loads the next page after the last entry shown.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore) return;
    state = AsyncData(current.copyWith(loadingMore: true));
    try {
      final salaryDay = await ref.read(salaryDayProvider.future);
      final range = financialMonthDayRange(query.month, salaryDay: salaryDay);
      final page = await ref
          .read(ledgerApiProvider)
          .list(
            limit: pageSize,
            before: current.entries.last.id,
            category: query.category,
            type: 'expense',
            startDate: range.startDay,
            endDate: '${range.endDay}T23:59:59.999',
          );
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
        total: current.total > 0 ? current.total - 1 : 0,
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


/// Debts and loans balance overview (STA-05).
final debtsOverviewProvider = FutureProvider<DebtsOverview>((ref) async {
  final scope = ref.watch(_statsSessionScopeProvider);
  if (!scope.signedIn) {
    return const DebtsOverview(balances: [], totalLent: 0, totalBorrowed: 0, net: 0);
  }
  final client = ref.watch(trpcClientProvider);
  try {
    final res = await client.query(Procedures.expense.getDebtBalances);
    if (res is Map<String, Object?>) {
      return DebtsOverview.fromJson(res);
    }
  } catch (_) {
    // Non-fatal, return empty debts overview
  }
  return const DebtsOverview(balances: [], totalLent: 0, totalBorrowed: 0, net: 0);
});

/// Spending vs budget or income comparison (STA-04, GAP-15).
final budgetComparisonProvider = FutureProvider<BudgetComparisonData>((ref) async {
  final scope = ref.watch(_statsSessionScopeProvider);
  if (!scope.signedIn) {
    return const BudgetComparisonData(
      allocated: 0,
      spent: 0,
      remaining: 0,
      percentage: 0,
      isExceeded: false,
      fallbackKind: BudgetFallbackKind.none,
    );
  }
  final client = ref.watch(trpcClientProvider);
  final stats = await ref.watch(monthStatsProvider.future);
  final spent = stats.expense;

  // 1. Check budget.list for overall budget
  try {
    final budgetRes = await client.query(Procedures.budget.list);
    if (budgetRes is Map<String, Object?> && budgetRes['budgets'] is List) {
      final list = budgetRes['budgets'] as List<Object?>;
      Map<String, Object?>? generalBudget;
      for (final item in list) {
        if (item is Map<String, Object?>) {
          final cat = item['category'] as String?;
          if (cat == null || cat.isEmpty || cat == 'all' || cat == 'الكل') {
            generalBudget = item;
            break;
          }
        }
      }

      if (generalBudget != null) {
        final limit = readAmount(generalBudget['monthlyLimit']) ?? 0;
        final currentSpent = readAmount(generalBudget['currentSpent']) ?? spent;
        final percentage = limit > 0 ? ((currentSpent / limit) * 100).round() : 0;
        return BudgetComparisonData(
          allocated: limit,
          spent: currentSpent,
          remaining: limit > currentSpent ? limit - currentSpent : 0,
          percentage: percentage,
          isExceeded: currentSpent > limit,
          fallbackKind: BudgetFallbackKind.budget,
          title: generalBudget['title'] as String?,
        );
      }
    }
  } catch (_) {}

  // 2. GAP-15 Fallback: Profile monthly income
  try {
    final profileRes = await client.query(Procedures.profile.getSmartProfile);
    if (profileRes is Map<String, Object?>) {
      final summary = SmartProfileSummary.fromJson(profileRes);
      if (summary.monthlyIncome != null && summary.monthlyIncome! > 0) {
        final income = summary.monthlyIncome!;
        final percentage = ((spent / income) * 100).round();
        return BudgetComparisonData(
          allocated: income,
          spent: spent,
          remaining: income > spent ? income - spent : 0,
          percentage: percentage,
          isExceeded: spent > income,
          fallbackKind: BudgetFallbackKind.profileIncome,
          title: 'الدخل الشهري المسجل',
        );
      }
    }
  } catch (_) {}

  // 3. Fallback: Month's income
  if (stats.income > 0) {
    final income = stats.income;
    final percentage = ((spent / income) * 100).round();
    return BudgetComparisonData(
      allocated: income,
      spent: spent,
      remaining: income > spent ? income - spent : 0,
      percentage: percentage,
      isExceeded: spent > income,
      fallbackKind: BudgetFallbackKind.monthIncome,
      title: 'إجمالي دخل الشهر',
    );
  }

  // 4. No budget and no income
  return BudgetComparisonData(
    allocated: 0,
    spent: spent,
    remaining: 0,
    percentage: 0,
    isExceeded: false,
    fallbackKind: BudgetFallbackKind.none,
  );
});

/// Yearly stats provider for the year in review (STA-09, GAP-18).
final yearlyStatsProvider = FutureProvider.family<YearlyStatsData, String>((ref, year) async {
  final scope = ref.watch(_statsSessionScopeProvider);
  if (!scope.signedIn) {
    return YearlyStatsData(year: year, totalExpense: 0, totalIncome: 0, netFlow: 0, count: 0, monthlyData: []);
  }
  final client = ref.watch(trpcClientProvider);
  try {
    final res = await client.query(
      Procedures.expense.getYearlyStats,
      input: {'year': year},
    );
    if (res is Map<String, Object?>) {
      return YearlyStatsData.fromJson(year, res);
    }
  } catch (_) {}
  return YearlyStatsData(year: year, totalExpense: 0, totalIncome: 0, netFlow: 0, count: 0, monthlyData: []);
});

/// Smart profile summary provider (STA-11).
final smartProfileSummaryProvider = FutureProvider<SmartProfileSummary>((ref) async {
  final scope = ref.watch(_statsSessionScopeProvider);
  if (!scope.signedIn) {
    return const SmartProfileSummary(profileCompleted: false);
  }
  final client = ref.watch(trpcClientProvider);
  try {
    final res = await client.query(Procedures.profile.getSmartProfile);
    if (res is Map<String, Object?>) {
      return SmartProfileSummary.fromJson(res);
    }
  } catch (_) {}
  return const SmartProfileSummary(profileCompleted: false);
});
