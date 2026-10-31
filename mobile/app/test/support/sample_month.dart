import 'test_app.dart';

/// A month as an Egyptian user might have it, so the record tab and the full list show real content.
void answerSampleMonth(FakeApi api) {
  final now = DateTime.now();
  Map<String, Object?> entry(
    int id,
    String amount,
    String category, {
    String type = 'expense',
    String? description,
    String? sub,
    int daysAgo = 0,
    int hour = 13,
  }) => {
    'id': id,
    'amount': amount,
    'type': type,
    'category': category,
    'subCategory': sub,
    'description': description,
    'date': DateTime(
      now.year,
      now.month,
      now.day - daysAgo,
      hour,
      20,
    ).toUtc().toIso8601String(),
  };
  final entries = [
    entry(9, '185.00', 'أكل وشرب', description: 'Talabat', hour: 21),
    entry(
      8,
      '96.00',
      'مواصلات',
      description: 'UBER *TRIP',
      sub: 'أوبر/كريم',
      hour: 9,
    ),
    entry(7, '50.00', 'أكل وشرب', sub: 'قهوة وكافيه', hour: 8),
    entry(
      6,
      '15000.00',
      'مرتب',
      type: 'income',
      sub: 'مرتب أساسي',
      daysAgo: 1,
      hour: 10,
    ),
    entry(5, '1250.00', 'فواتير', sub: 'كهرباء', daysAgo: 1, hour: 18),
    entry(4, '320.00', 'تسوق', description: 'Carrefour', daysAgo: 2, hour: 19),
    entry(
      3,
      '500.00',
      'تحويل',
      type: 'transfer',
      sub: 'انستاباي',
      daysAgo: 3,
      hour: 12,
    ),
  ];
  api
    ..answer(
      'expense.getMonthSummary',
      (_) => {
        'totalIncome': '15000.00',
        'totalExpense': '4250.50',
        'count': 23,
      },
    )
    ..answer('expense.list', (input) {
      final map = input is Map ? input : const <Object?, Object?>{};
      final category = map['category'];
      final type = map['type'];
      final filtered = [
        for (final row in entries)
          if ((category == null || row['category'] == category) &&
              (type == null || row['type'] == type))
            row,
      ];
      return {'items': filtered, 'total': filtered.length};
    })
    ..answer(
      'expense.getMonthlyStats',
      (_) => {
        'totalExpense': 4250.5,
        'totalIncome': 15000,
        'dailyAverage': 152,
        'totalTxnCount': 23,
        'categoryBreakdown': [
          {'name': 'أكل وشرب', 'value': 1680, 'count': 11},
          {'name': 'فواتير', 'value': 1250, 'count': 2},
          {'name': 'مواصلات', 'value': 540, 'count': 6},
          {'name': 'تسوق', 'value': 320, 'count': 1},
          {'name': 'اشتراكات', 'value': 260, 'count': 2},
          {'name': 'ترفيه', 'value': 200.5, 'count': 1},
        ],
        'comparativeAnalysis': {
          'previousMonth': {'totalExpense': 4830, 'totalIncome': 15000},
        },
        'behavioralInsights': {
          'expenseChangePercent': -12,
          'comparisonType': 'monthly',
          'topSpendingDay': {
            'date': DateTime(
              now.year,
              now.month,
              now.day - 1,
            ).toIso8601String(),
            'amount': 1250,
          },
          'mostRecurringExpense': {'name': 'قهوة وكافيه', 'count': 9},
        },
      },
    )
    ..answer(
      'wallet.getWallets',
      (_) => [
        {
          'id': 1,
          'name': 'كارت CIB',
          'provider': 'CIB',
          'balance': '24350.00',
          'lastFourDigits': '4821',
          'balanceObservedAt': DateTime(
            now.year,
            now.month,
            now.day,
            9,
          ).toUtc().toIso8601String(),
        },
        {
          'id': 2,
          'name': 'فودافون كاش',
          'provider': 'VodafoneCash',
          'balance': '1820.50',
          'lastFourDigits': null,
          'balanceObservedAt': DateTime(
            now.year,
            now.month,
            now.day - 3,
            18,
          ).toUtc().toIso8601String(),
        },
        {
          'id': 3,
          'name': 'InstaPay',
          'provider': 'InstaPay',
          'balance': '6200.00',
          'lastFourDigits': null,
          'balanceObservedAt': null,
        },
      ],
    )
    ..answer(
      'wallet.getWalletMonth',
      (_) => {
        'month': '${now.year}-${now.month.toString().padLeft(2, '0')}',
        'moneyIn': 15000,
        'moneyOut': 3120.5,
        'count': 14,
      },
    )
    ..answer(
      'wallet.getWalletTransactions',
      (_) => [
        for (final row in entries)
          if (row['type'] != 'transfer') {...row, 'walletId': 1},
      ],
    )
    ..answer(
      'ai.parseExpense',
      (_) => {
        'decision': 'review',
        'items': [
          {
            'amount': 50,
            'type': 'expense',
            'category': 'أكل وشرب',
            'subCategory': 'قهوة وكافيه',
            'description': 'قهوة',
          },
          {
            'amount': 120,
            'type': 'expense',
            'category': 'مواصلات',
            'subCategory': 'أوبر/كريم',
            'description': 'أوبر',
          },
        ],
      },
    );
}
