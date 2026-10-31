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

  Map<String, Object?> toJson() => {
    'name': name,
    'value': amount,
    'count': count,
  };
}

/// A day's spending and income in the month (CAL-01).
final class DayTrendPoint {
  const DayTrendPoint({
    required this.date,
    required this.amount,
    this.income = 0,
  });

  final String date;
  final num amount;
  final num income;
}

/// A weekday's spending rollup (STA-03).
final class WeekdayTrendPoint {
  const WeekdayTrendPoint({
    required this.name,
    required this.amount,
  });

  final String name;
  final num amount;
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
    this.dayTrend = const [],
    this.dayOfWeekTrend = const [],
    this.spendingBehavior,
    this.spendingBehaviorLabelAr,
    this.spendingBehaviorLabelEn,
    this.automatedExpense = 0,
    this.automatedIncome = 0,
    this.netFlow = 0,
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
    final dayTrend = [
      for (final raw in (json['dayTrend'] as List<Object?>? ?? const []))
        if (raw is Map<String, Object?> && raw['date'] != null)
          DayTrendPoint(
            date: raw['date'] as String,
            amount: readAmount(raw['amount']) ?? 0,
            income: readAmount(raw['income']) ?? 0,
          ),
    ];
    final dayOfWeekTrend = [
      for (final raw in (json['dayOfWeekTrend'] as List<Object?>? ?? const []))
        if (raw is Map<String, Object?> && raw['name'] != null)
          WeekdayTrendPoint(
            name: raw['name'] as String,
            amount: readAmount(raw['amount']) ?? 0,
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
      dayTrend: dayTrend,
      dayOfWeekTrend: dayOfWeekTrend,
      spendingBehavior: insights['spendingBehavior'] as String?,
      spendingBehaviorLabelAr: insights['spendingBehaviorLabelAr'] as String?,
      spendingBehaviorLabelEn: insights['spendingBehaviorLabelEn'] as String?,
      automatedExpense: readAmount(json['automatedExpense']) ?? 0,
      automatedIncome: readAmount(json['automatedIncome']) ?? 0,
      netFlow: readAmount(json['netFlow']) ?? 0,
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
  final List<DayTrendPoint> dayTrend;
  final List<WeekdayTrendPoint> dayOfWeekTrend;
  final String? spendingBehavior;
  final String? spendingBehaviorLabelAr;
  final String? spendingBehaviorLabelEn;
  final num automatedExpense;
  final num automatedIncome;
  final num netFlow;

  /// Nothing recorded in the month.
  bool get isEmpty => count == 0 && expense == 0 && income == 0;

  Map<String, Object?> toJson() => {
    'totalExpense': expense,
    'totalIncome': income,
    'dailyAverage': dailyAverage,
    'totalTxnCount': count,
    'categoryBreakdown': [for (final category in categories) category.toJson()],
    'comparativeAnalysis': {
      'previousMonth': {'totalExpense': previousExpense},
    },
    'behavioralInsights': {
      'expenseChangePercent': changePercent,
      'comparisonType': comparison.name,
      if (topDay != null || topDayAmount != null)
        'topSpendingDay': {
          'date': topDay?.toIso8601String(),
          'amount': topDayAmount,
        },
      if (mostRecurring != null || mostRecurringCount != null)
        'mostRecurringExpense': {
          'name': mostRecurring,
          'count': mostRecurringCount,
        },
    },
  };

  static Map<String, Object?> _object(Object? value) =>
      value is Map<String, Object?> ? value : const <String, Object?>{};
}
