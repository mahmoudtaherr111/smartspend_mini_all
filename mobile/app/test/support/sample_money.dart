import 'test_app.dart';

/// Budgets, goals, people, installments and the AI Center as an Egyptian user might have them, so the screens the
/// render loop draws show real content.
void answerSampleMoney(FakeApi api) {
  api.answer(
    'budget.list',
    (_) => [
      {
        'id': 1,
        'title': 'الأكل',
        'category': 'أكل وشرب',
        'monthlyLimit': '4000',
        'currentSpent': 3400.0,
        'percentage': 85,
        'isNearLimit': true,
      },
      {
        'id': 2,
        'title': 'المواصلات',
        'category': 'مواصلات',
        'monthlyLimit': '1500',
        'currentSpent': 1650.0,
        'percentage': 110,
        'isExceeded': true,
      },
      {
        'id': 3,
        'title': 'الخروج',
        'category': 'ترفيه',
        'monthlyLimit': '2000',
        'currentSpent': 600.0,
        'percentage': 30,
      },
    ],
  );
  final goals = [
    {
      'id': 1,
      'title': 'مقدم عربية',
      'description': 'نحوش من المرتب كل شهر',
      'targetAmount': '120000',
      'targetDate': '2027-06-01T00:00:00.000Z',
      'status': 'active',
      'aiPlan': {
        'progressPercent': 35,
        'insight': 'لو حوشت 7,000 ج.م كل شهر هتوصل قبل ميعادك بشهر.',
        'weeklyActions': ['قلل الدليفري مرة في الأسبوع'],
      },
      'lastAnalyzedAt': '2026-10-20T10:00:00.000Z',
      'createdAt': '2026-05-01T10:00:00.000Z',
    },
    {
      'id': 2,
      'title': 'رحلة الساحل',
      'targetAmount': '15000',
      'status': 'active',
      'createdAt': '2026-07-01T10:00:00.000Z',
    },
  ];
  api.answer('goals.list', (_) => {'goals': goals, 'items': goals});
  final people = [
    {
      'id': 11,
      'contactId': 11,
      'name': 'أحمد',
      'balance': 1250,
      'lent': 2000,
      'received': 750,
      'count': 4,
      'lastDate': '2026-10-28T10:00:00.000Z',
    },
    {
      'id': 12,
      'contactId': 12,
      'name': 'سارة',
      'balance': -400,
      'lent': 0,
      'received': 400,
      'count': 1,
      'lastDate': '2026-10-12T10:00:00.000Z',
    },
  ];
  api.answer('profile.listContacts', (_) => {'contacts': people});
  api.answer(
    'expense.getDebtBalances',
    (_) => {'balances': people, 'owedToYou': 1250, 'youOwe': 400},
  );
  api.answer(
    'expense.listInstallmentPlans',
    (_) => [
      {
        'id': 1,
        'title': 'موبايل سامسونج',
        'keyword': 'فاليو',
        'monthlyAmount': 1500,
        'totalInstallments': 12,
        'paid': 5,
        'remaining': 7,
        'remainingAmount': 10500,
        'countedBy': 'expense',
      },
    ],
  );
  api.answer(
    'ai.getCachedMonthlyInsights',
    (_) => {
      'insights': {
        'response_text':
            'صرفت الشهر ده 12,430 ج.م، أقل من الشهر اللي فات بـ 900. أكبر بند كان الأكل والشرب، '
            'وأغلبه دليفري في آخر الأسبوع.',
        'alerts': ['⚠️ المواصلات عدّت ميزانيتها بـ 150 ج.م'],
        'data_table': [
          {'category': 'أكل وشرب', 'amount': 3400, 'percent': 27},
          {'category': 'مواصلات', 'amount': 1650, 'percent': 13},
        ],
      },
    },
  );
  api.answer(
    'chat.getQuickActions',
    (_) => {
      'actions': ['صرفت كام الشهر ده؟', 'إيه أكبر بند صرف؟'],
    },
  );
  api.answer(
    'ai.compareMonths',
    (_) => {
      'response_text': 'الشهر ده صرفت أقل بـ 900 ج.م، والأكل هو اللي نزل.',
      'total_diff': -900,
      'changes': [
        {'category': 'أكل وشرب', 'diff': -700},
        {'category': 'مواصلات', 'diff': 200},
      ],
    },
  );
  api.answer(
    'ai.generateYearlyInsights',
    (_) => {'insights': 'السنة دي صرفت أكتر على الأكل والمواصلات.'},
  );
  api.answer(
    'expense.getSeasonSpending',
    (_) => {
      'season': 'ramadan',
      'label': 'رمضان',
      'startDay': '2026-02-18',
      'endDay': '2026-03-19',
      'total': 8400,
      'count': 31,
      'byCategory': [
        {'category': 'أكل وشرب', 'amount': 5200, 'count': 20},
      ],
    },
  );
  api.answer(
    'profile.getInAppNotifications',
    (_) => [
      {
        'id': 1,
        'type': 'budget',
        'title': 'قربت من ميزانية الأكل',
        'body': 'صرفت 85% من ميزانية الأكل الشهر ده.',
        'isRead': false,
        'createdAt': '2026-10-28T10:00:00.000Z',
      },
    ],
  );
  api.answer('session.listMine', (_) => <Object?>[]);
  api.answer('referral.myCode', (_) => {'code': 'MONA25'});
  api.answer('support.listMine', (_) => <Object?>[]);
  api.answer('capture.pending', (_) => <Object?>[]);
  api.answer('chat.getConversations', (_) => <Object?>[]);
  api.answer('chat.listMemories', (_) => <Object?>[]);
}
