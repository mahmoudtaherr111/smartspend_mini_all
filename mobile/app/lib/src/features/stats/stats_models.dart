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
  const WeekdayTrendPoint({required this.name, required this.amount});

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

/// A person's debt or loan balance (STA-05).
final class DebtBalanceItem {
  const DebtBalanceItem({
    this.contactId,
    required this.name,
    required this.balance,
    required this.lent,
    required this.received,
    required this.count,
  });

  factory DebtBalanceItem.fromJson(Map<String, Object?> json) {
    return DebtBalanceItem(
      contactId: (json['contactId'] as num?)?.toInt(),
      name: (json['name'] as String?) ?? '',
      balance: readAmount(json['balance']) ?? 0,
      lent: readAmount(json['lent']) ?? 0,
      received: readAmount(json['received']) ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }

  final int? contactId;
  final String name;

  /// Positive: person owes the user (ليك). Negative: user owes the person (عليك).
  final num balance;
  final num lent;
  final num received;
  final int count;
}

/// The user's debts and loans overview (STA-05).
final class DebtsOverview {
  const DebtsOverview({
    required this.balances,
    required this.totalLent,
    required this.totalBorrowed,
    required this.net,
  });

  factory DebtsOverview.fromJson(Map<String, Object?> json) {
    final rawBalances = json['balances'] as List<Object?>? ?? const [];
    return DebtsOverview(
      balances: [
        for (final item in rawBalances)
          if (item is Map<String, Object?>) DebtBalanceItem.fromJson(item),
      ],
      totalLent: readAmount(json['totalLent']) ?? 0,
      totalBorrowed: readAmount(json['totalBorrowed']) ?? 0,
      net: readAmount(json['net']) ?? 0,
    );
  }

  final List<DebtBalanceItem> balances;
  final num totalLent;
  final num totalBorrowed;
  final num net;

  bool get isEmpty => balances.isEmpty;
}

/// Fallback source for budget comparison when no general budget exists (GAP-15).
enum BudgetFallbackKind { budget, profileIncome, monthIncome, none }

/// Month's spending vs budget or income fallback (STA-04, GAP-15).
final class BudgetComparisonData {
  const BudgetComparisonData({
    required this.allocated,
    required this.spent,
    required this.remaining,
    required this.percentage,
    required this.isExceeded,
    required this.fallbackKind,
    this.title,
  });

  final num allocated;
  final num spent;
  final num remaining;
  final int percentage;
  final bool isExceeded;
  final BudgetFallbackKind fallbackKind;
  final String? title;
}

/// A month in the yearly review (STA-09, GAP-18).
final class YearlyMonthPoint {
  const YearlyMonthPoint({
    required this.month,
    required this.monthKey,
    required this.amount,
    required this.hasData,
  });

  factory YearlyMonthPoint.fromJson(Map<String, Object?> json) {
    return YearlyMonthPoint(
      month: (json['month'] as String?) ?? '',
      monthKey: (json['monthKey'] as String?) ?? '',
      amount: readAmount(json['amount']) ?? 0,
      hasData: json['hasData'] == true,
    );
  }

  final String month;
  final String monthKey;
  final num amount;
  final bool hasData;
}

/// Yearly statistics for the year in review (STA-09, GAP-18).
final class YearlyStatsData {
  const YearlyStatsData({
    required this.year,
    required this.totalExpense,
    required this.totalIncome,
    required this.netFlow,
    required this.count,
    required this.monthlyData,
  });

  factory YearlyStatsData.fromJson(String year, Map<String, Object?> json) {
    final rawMonthly = json['monthlyData'] as List<Object?>? ?? const [];
    return YearlyStatsData(
      year: year,
      totalExpense: readAmount(json['totalExpense']) ?? 0,
      totalIncome: readAmount(json['totalIncome']) ?? 0,
      netFlow: readAmount(json['netFlow']) ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
      monthlyData: [
        for (final item in rawMonthly)
          if (item is Map<String, Object?>) YearlyMonthPoint.fromJson(item),
      ],
    );
  }

  final String year;
  final num totalExpense;
  final num totalIncome;
  final num netFlow;
  final int count;
  final List<YearlyMonthPoint> monthlyData;

  /// Top spending month name and amount, if any.
  ({String name, num amount})? get topMonth {
    YearlyMonthPoint? top;
    for (final m in monthlyData) {
      if (!m.hasData) continue;
      if (top == null || m.amount > top.amount) {
        top = m;
      }
    }
    if (top == null || top.amount <= 0) return null;
    return (name: top.month, amount: top.amount);
  }
}

/// Learned facts summary from the user's Smart Profile (STA-11).
final class SmartProfileSummary {
  const SmartProfileSummary({
    this.monthlyIncome,
    this.salaryDay,
    this.financialGoal,
    this.personality,
    required this.profileCompleted,
    this.streak = 0,
  });

  factory SmartProfileSummary.fromJson(Map<String, Object?> json) {
    final financial =
        json['financialInfo'] as Map<String, Object?>? ?? const {};
    final legacy = json['legacy'] as Map<String, Object?>? ?? const {};
    final gamification =
        json['gamification'] as Map<String, Object?>? ?? const {};

    final monthlyIncome =
        readAmount(financial['monthlyIncome']) ??
        readAmount(legacy['monthlyIncome']);
    final salaryDay = (financial['salaryDay'] as num?)?.toInt();
    final financialGoal =
        (financial['primaryGoal'] as String?) ??
        (legacy['financialGoal'] as String?);
    final personality =
        (financial['spendingStyle'] as String?) ??
        (legacy['financialPersonality'] as String?);

    return SmartProfileSummary(
      monthlyIncome: monthlyIncome,
      salaryDay: salaryDay,
      financialGoal: financialGoal,
      personality: personality,
      profileCompleted: json['profileCompleted'] == true,
      streak: (gamification['currentStreak'] as num?)?.toInt() ?? 0,
    );
  }

  final num? monthlyIncome;
  final int? salaryDay;
  final String? financialGoal;
  final String? personality;
  final bool profileCompleted;
  final int streak;
}
