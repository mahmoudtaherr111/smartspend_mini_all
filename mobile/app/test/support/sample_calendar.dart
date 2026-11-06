import 'test_app.dart';

/// The calendar's procedures answered as `api/coach-router.ts` answers them. Each mutation checks its input against
/// the keys the server's schema requires and allows, so an app that sends another shape fails here as it would
/// against the server (the server would drop an unknown key; here it fails, because it means the app and the server
/// disagree).
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
  api.answer('coach.overview', (_) => sampleCoachOverview());
  api.answer('coach.paymentSuggestions', (input) {
    coachInput(input, required: {'cashflowId', 'dueDay'});
    return [
      {
        'id': 501,
        'amount': 2500,
        'available': 2500,
        'category': 'إيجار',
        'description': 'تحويل إيجار الشقة',
        'date': '2026-10-01T10:00:00Z',
        'type': 'expense',
        'sameAmount': true,
        'sharedWord': null,
      },
    ];
  });
  api.answer('coach.addCashflow', (input) {
    coachInput(
      input,
      required: {
        'kind',
        'direction',
        'title',
        'amount',
        'recurrence',
        'startDay',
      },
      optional: {
        'endDay',
        'certainty',
        'contactId',
        'businessId',
        'installmentPlanId',
      },
    );
    return {'id': 103};
  });
  api.answer('coach.updateCashflow', (input) {
    coachInput(
      input,
      required: {'id'},
      optional: {
        'kind',
        'direction',
        'title',
        'amount',
        'recurrence',
        'startDay',
        'endDay',
        'certainty',
        'contactId',
        'businessId',
        'status',
      },
    );
    return {'success': true};
  });
  api.answer('coach.settle', (input) {
    coachInput(
      input,
      required: {'cashflowId', 'dueDay'},
      optional: {'expenseId', 'amount'},
    );
    return {'id': 9001, 'amount': 2500};
  });
  api.answer('coach.unsettle', (input) {
    coachInput(input, required: {'settlementId'});
    return {'success': true};
  });
  api.answer('coach.setStepStatus', (input) {
    coachInput(input, required: {'stepId', 'status'});
    return {'success': true};
  });
  api.answer('coach.setReminder', (input) {
    final at = coachInput(input, required: {'stepId', 'at'})['at'];
    if (at is! String ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$').hasMatch(at)) {
      throw const TrpcFailure('BAD_REQUEST', 400, 'اختار اليوم والساعة');
    }
    return {'revision': 1};
  });
  api.answer('coach.cancelReminder', (input) {
    coachInput(input, required: {'stepId'});
    return {'success': true};
  });
}

/// The input as a map, or a BAD_REQUEST like the server's when a required key is missing or an unknown one is sent.
Map<String, Object?> coachInput(
  Object? input, {
  required Set<String> required,
  Set<String> optional = const {},
}) {
  if (input is! Map<String, Object?>) {
    throw const TrpcFailure('BAD_REQUEST', 400, 'No input');
  }
  final missing = required.difference(input.keys.toSet());
  final unknown = input.keys.toSet().difference({...required, ...optional});
  if (missing.isNotEmpty || unknown.isNotEmpty) {
    throw TrpcFailure(
      'BAD_REQUEST',
      400,
      'missing: ${missing.join(', ')}; unknown: ${unknown.join(', ')}',
    );
  }
  return input;
}

/// `coach.overview` exactly as the server answers it (api/coach-router.ts): `today`, `due` (one entry per due date,
/// its status decided by the server), `settlements` (decimal amounts come as strings), `schedules`, `position` and
/// `plan`. Captured from a running server; change it only when the server's answer changes.
Map<String, Object?> sampleCoachOverview() => {
  'today': '2026-10-19',
  'plan': {
    'id': 1,
    'title': 'خطة توفير مصاريف المدارس',
    'goal': 'توفير 5000 ج.م قبل نهاية الشهر',
    'status': 'active',
    'revision': 1,
    'reviewDay': '2026-10-31',
    'acceptedAt': '2026-10-01T09:00:00.000Z',
    'evidence': <Object?>[],
    'steps': [
      {
        'id': 201,
        'title': 'تقليل الأكل برة',
        'kind': 'spend_limit',
        'target': null,
        'status': 'pending',
        'dueDay': null,
        'doneAt': null,
        'doneEvidence': null,
        'remindAt': null,
        'reminderStatus': 'none',
      },
      {
        'id': 202,
        'title': 'شراء مستلزمات بالجملة',
        'kind': 'review',
        'target': null,
        'status': 'done',
        'dueDay': null,
        'doneAt': '2026-10-05T12:00:00.000Z',
        'doneEvidence': 'user',
        'remindAt': null,
        'reminderStatus': 'none',
      },
    ],
  },
  'due': [
    {
      'cashflowId': 102,
      'contactId': null,
      'contactName': null,
      'title': 'فاتورة الكهرباء',
      'kind': 'bill',
      'direction': 'out',
      'certainty': 'confirmed',
      'dueDay': '2026-10-15',
      'amount': 350,
      'paid': 350,
      'remaining': 0,
      'status': 'paid',
    },
    {
      'cashflowId': 101,
      'contactId': null,
      'contactName': null,
      'title': 'إيجار الشقة',
      'kind': 'rent',
      'direction': 'out',
      'certainty': 'confirmed',
      'dueDay': '2026-11-01',
      'amount': 2500,
      'paid': 0,
      'remaining': 2500,
      'status': 'due',
    },
  ],
  'position': {
    'today': '2026-10-19',
    'until': '2026-10-25',
    'untilIsPayday': true,
    'wallets': {
      'total': 12000,
      'count': 1,
      'oldestObservedDay': '2026-10-18',
      'unknownAge': 0,
    },
    'duesKnown': 3000,
    'duesUnknownAmount': <Object?>[],
    'duesUnconfirmed': <Object?>[],
    'undated': <Object?>[],
    'incomeConfirmed': 0,
    'incomeEstimated': 0,
    'freeBeforeIncome': 9000,
    'freeWithConfirmedIncome': 9000,
    'days': 6,
    'occurrences': <Object?>[],
  },
  'schedules': [
    {
      'id': 101,
      'kind': 'rent',
      'direction': 'out',
      'title': 'إيجار الشقة',
      'amount': '2500.00',
      'recurrence': 'monthly',
      'startDay': '2026-09-01',
      'endDay': null,
      'certainty': 'confirmed',
      'status': 'active',
      'trackedFrom': '2026-09-01',
      'contactId': null,
      'contactName': null,
    },
    {
      'id': 102,
      'kind': 'bill',
      'direction': 'out',
      'title': 'فاتورة الكهرباء',
      'amount': '350.00',
      'recurrence': 'monthly',
      'startDay': '2026-09-15',
      'endDay': null,
      'certainty': 'confirmed',
      'status': 'active',
      'trackedFrom': '2026-09-01',
      'contactId': null,
      'contactName': null,
    },
  ],
  'settlements': [
    {
      'id': 77,
      'source': 'linked',
      'cashflowId': 102,
      'dueDay': '2026-10-15',
      'amount': '350.00',
      'expenseId': 601,
    },
  ],
};
