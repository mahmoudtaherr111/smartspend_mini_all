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
    ..answer('expense.list', (_) => {'items': entries, 'total': entries.length})
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
