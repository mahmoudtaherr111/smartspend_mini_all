import '../ledger/ledger_models.dart' show readAmount;

/// A category's spending in a month (`expense.getMonthlyStats`, `categoryBreakdown`).
final class CategoryAmount {
  const CategoryAmount({
    required this.name,
    required this.amount,
    required this.count,
  });

  final String name;
  final num amount;
  final int count;
}

/// How this month's spending compares with the last: by whole month near its end, by the same week before that
/// (the server decides, `behavioralInsights.comparisonType`).
enum Comparison { monthly, weekly }

/// One month's statistics as `expense.getMonthlyStats` answers them; the server computes every figure, in Cairo
/// time and from payday when the person has one (mobile rule 8).
final class MonthStats {
  const MonthStats({
    required this.expense,
    required this.income,
    required this.dailyAverage,
    required this.count,
    required this.previousExpense,
    required this.categories,
    this.changePercent,
    this.comparison = Comparison.monthly,
    this.topDay,
    this.topDayAmount,
    this.mostRecurring,
    this.mostRecurringCount,
  });

  factory MonthStats.fromJson(Map<String, Object?> json) {
    final insights = _object(json['behavioralInsights']);
    final previous = _object(
      _object(json['comparativeAnalysis'])['previousMonth'],
    );
    final topDay = _object(insights['topSpendingDay']);
    final recurring = _object(insights['mostRecurringExpense']);
    final categories = [
      for (final raw
          in (json['categoryBreakdown'] as List<Object?>? ?? const []))
        if (raw case {'name': final String name, 'value': final Object? value})
          CategoryAmount(
            name: name,
            amount: readAmount(value) ?? 0,
            count: (raw['count'] as num?)?.toInt() ?? 0,
          ),
    ];
    return MonthStats(
      expense: readAmount(json['totalExpense']) ?? 0,
      income: readAmount(json['totalIncome']) ?? 0,
      dailyAverage: readAmount(json['dailyAverage']) ?? 0,
      count:
          (json['totalTxnCount'] as num?)?.toInt() ??
          (json['count'] as num?)?.toInt() ??
          0,
      previousExpense: readAmount(previous['totalExpense']) ?? 0,
      categories: categories,
      changePercent: (insights['expenseChangePercent'] as num?)?.round(),
      comparison: insights['comparisonType'] == 'weekly'
          ? Comparison.weekly
          : Comparison.monthly,
      topDay: switch (topDay['date']) {
        final String date => DateTime.tryParse(date),
        _ => null,
      },
      topDayAmount: readAmount(topDay['amount']),
      mostRecurring: recurring['name'] as String?,
      mostRecurringCount: (recurring['count'] as num?)?.toInt(),
    );
  }

  final num expense;
  final num income;
  final num dailyAverage;
  final int count;
  final num previousExpense;
  final List<CategoryAmount> categories;

  /// Spending against the comparison period, in whole percent; null with nothing to compare with.
  final int? changePercent;
  final Comparison comparison;
  final DateTime? topDay;
  final num? topDayAmount;
  final String? mostRecurring;
  final int? mostRecurringCount;

  /// Nothing recorded in the month.
  bool get isEmpty => count == 0 && expense == 0 && income == 0;

  static Map<String, Object?> _object(Object? value) =>
      value is Map<String, Object?> ? value : const <String, Object?>{};
}
