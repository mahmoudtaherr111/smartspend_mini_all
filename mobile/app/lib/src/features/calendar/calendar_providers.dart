import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import '../ledger/ledger_providers.dart';
import '../stats/stats_models.dart';
import '../stats/stats_providers.dart';
import 'calendar_api.dart';
import 'calendar_models.dart';

final calendarApiProvider = Provider<CalendarApi>((ref) {
  return CalendarApi(ref.watch(trpcClientProvider));
});

/// Overview data for the user's cashflow position, active plan, and commitments (CAL-02, CAL-03, CAL-06).
final coachOverviewProvider = FutureProvider<CoachOverviewData>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session is! SignedIn) {
    return const CoachOverviewData(
      position: CashPosition(
        untilIsPayday: false,
        until: '',
        days: 0,
        walletsTotal: 0,
        walletsCount: 0,
        duesKnown: 0,
        freeBeforeIncome: 0,
      ),
    );
  }

  try {
    final overview = await ref.watch(calendarApiProvider).getOverview();
    ref.read(networkStatusProvider.notifier).reached();
    return overview;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    return const CoachOverviewData(
      position: CashPosition(
        untilIsPayday: false,
        until: '',
        days: 0,
        walletsTotal: 0,
        walletsCount: 0,
        duesKnown: 0,
        freeBeforeIncome: 0,
      ),
    );
  }
});

/// Selected month offset for the calendar tab (0 is current month).
final calendarMonthOffsetProvider = NotifierProvider<CalendarMonthOffset, int>(
  CalendarMonthOffset.new,
);

class CalendarMonthOffset extends Notifier<int> {
  @override
  int build() => 0;

  void previous() => state++;
  void next() {
    if (state > 0) state--;
  }

  void reset() => state = 0;
}

/// Statistics for the calendar tab's selected month (including `dayTrend` for the calendar grid).
final calendarMonthStatsProvider = FutureProvider<MonthStats>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session is! SignedIn) {
    return const MonthStats(
      expense: 0,
      income: 0,
      dailyAverage: 0,
      count: 0,
      previousExpense: 0,
      categories: [],
    );
  }

  final offset = ref.watch(calendarMonthOffsetProvider);
  final salaryDay = ref.watch(salaryDayProvider).value;

  // Compute month key (YYYY-MM)
  final now = DateTime.now();
  final target = DateTime(now.year, now.month - offset, 1);
  final monthKey = '${target.year}-${target.month.toString().padLeft(2, '0')}';

  try {
    final stats = await ref.watch(statsRepositoryProvider).month(
      monthKey,
      salaryDay: salaryDay,
    );
    ref.read(networkStatusProvider.notifier).reached();
    return stats;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    return const MonthStats(
      expense: 0,
      income: 0,
      dailyAverage: 0,
      count: 0,
      previousExpense: 0,
      categories: [],
    );
  }
});
