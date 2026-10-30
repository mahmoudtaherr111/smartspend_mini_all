import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
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

/// The statistics of the month the tab shows.
final monthStatsProvider = FutureProvider<MonthStats>((ref) async {
  final month = await ref.watch(statsMonthProvider.future);
  final salaryDay = await ref.watch(salaryDayProvider.future);
  return ref.watch(statsRepositoryProvider).month(month, salaryDay: salaryDay);
});
