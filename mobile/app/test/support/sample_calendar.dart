import 'test_app.dart';

/// A plan and commitments as `coach.overview` answers them, so the calendar shows real content.
void answerSampleCalendar(FakeApi api, {int? salaryDay = 25}) {
  api.answer(
    'profile.getSmartProfile',
    (_) => {
      'financialInfo': {
        if (salaryDay != null) ...{
          'hasFixedSalary': true,
          'salaryDay': salaryDay,
        },
      },
    },
  );
  api.answer(
    'coach.overview',
    (_) => {
      'position': {
        'untilIsPayday': true,
        'until': '2026-10-25',
        'days': 6,
        'wallets': {'count': 1, 'total': 12000},
        'duesKnown': 3000,
        'freeBeforeIncome': 9000,
        'incomeConfirmed': 0,
        'incomeEstimated': 0,
      },
      'cashflows': [
        {
          'id': 101,
          'title': 'إيجار الشقة',
          'kind': 'rent',
          'direction': 'out',
          'amount': 2500,
          'dueDay': 1,
          'recurrence': 'monthly',
          'status': 'due',
        },
        {
          'id': 102,
          'title': 'فاتورة الكهرباء',
          'kind': 'bill',
          'direction': 'out',
          'amount': 350,
          'dueDay': 15,
          'recurrence': 'monthly',
          'status': 'paid',
        },
      ],
      'plan': {
        'id': 1,
        'title': 'خطة توفير مصاريف المدارس',
        'goal': 'توفير 5000 ج.م قبل نهاية الشهر',
        'steps': [
          {
            'id': 201,
            'title': 'تقليل الأكل برة',
            'status': 'pending',
            'remindAt': null,
          },
          {
            'id': 202,
            'title': 'شراء مستلزمات بالجملة',
            'status': 'done',
            'remindAt': null,
          },
        ],
      },
    },
  );
  api.answer(
    'coach.paymentSuggestions',
    (_) => [
      {
        'id': 501,
        'amount': 2500,
        'category': 'إيجار',
        'description': 'تحويل إيجار الشقة',
        'date': '2026-10-01T10:00:00Z',
      },
    ],
  );
  api.answer('coach.settle', (_) => {'success': true});
  api.answer('coach.setStepStatus', (_) => {'success': true});
}
