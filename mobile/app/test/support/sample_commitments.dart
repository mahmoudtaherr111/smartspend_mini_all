import 'test_app.dart';

/// The render harness turns this on so known services carry the logo address the server would give them.
bool sampleCommitmentLogos = false;

String? _logo(String? slug) =>
    sampleCommitmentLogos && slug != null ? '/api/brand-logos/$slug.png' : null;

/// Checks a commitments input against the keys `api/commitments-router.ts` takes: a missing required key or a key
/// the server does not know fails the test, since it means the app and the server disagree.
Map<String, Object?> commitmentsInput(
  Object? input, {
  Set<String> required = const {},
  Set<String> optional = const {},
}) {
  final map = input! as Map<String, Object?>;
  for (final key in required) {
    if (!map.containsKey(key)) throw StateError('missing "$key" in $map');
  }
  for (final key in map.keys) {
    if (!required.contains(key) && !optional.contains(key)) {
      throw StateError('"$key" is not in the server\'s schema: $map');
    }
  }
  return map;
}

/// The keys `commitments.create` takes (its `fields` schema).
const createKeys = {
  'shape',
  'kind',
  'title',
  'direction',
  'provider',
  'catalogSlug',
  'contactId',
  'contactName',
  'contactRelation',
  'beneficiaryContactId',
  'beneficiaryName',
  'beneficiaryRelation',
  'amount',
  'amountVaries',
  'recurrence',
  'intervalCount',
  'startDay',
  'endDay',
  'occurrenceCount',
  'remainingCount',
  'paidBeforeCount',
  'totalAmount',
  'repayment',
  'items',
  'paidSoFar',
  'gam3eyaTurn',
  'gam3eyaTurns',
  'paymentMethod',
  'category',
  'subCategory',
  'originExpenseId',
  'remindDaysBefore',
  'remindHour',
  'remindersEnabled',
};

Map<String, Object?> _due(
  int cashflowId,
  String day,
  String title,
  String kind,
  num? amount, {
  String status = 'due',
  String direction = 'out',
  num paid = 0,
  int? number,
  int? total,
  String? slug,
  String? label,
  bool undated = false,
  List<Map<String, Object?>> settlements = const [],
}) => {
  'cashflowId': cashflowId,
  'dueDay': day,
  'effectiveDay': day,
  'day': day,
  'title': title,
  'kind': kind,
  'direction': direction,
  'status': status,
  'amount': amount,
  'paid': paid,
  'remaining': amount == null ? null : amount - paid,
  'number': number,
  'total': total,
  'label': label,
  'undated': undated,
  'estimated': false,
  'catalogSlug': slug,
  'brandColor': null,
  'logoUrl': _logo(slug),
  'settlements': settlements,
};

Map<String, Object?> _brand(String slug, String name, String nameAr) => {
  'slug': slug,
  'name': name,
  'nameAr': nameAr,
  'brandColor': null,
  'logoUrl': _logo(slug),
  'cycle': 'monthly',
  'group': _groups[slug] ?? 'general_subscriptions',
};

const _groups = {
  'netflix': 'streaming',
  'shahid': 'streaming',
  'watch_it': 'streaming',
  'osn_plus': 'streaming',
  'yango_play': 'streaming',
  'tod': 'streaming',
  'spotify': 'music',
  'anghami': 'music',
  'youtube_premium': 'streaming',
  'chatgpt': 'ai_tools',
  'icloud': 'software',
};

Map<String, Object?> _item(
  int id,
  String kind,
  String shape,
  String title, {
  num? amount,
  String direction = 'out',
  Map<String, Object?>? catalog,
  Map<String, Object?>? next,
  int? paidCount,
  int? totalCount,
  num? remainingAmount,
  int overdue = 0,
  int? occurrenceCount,
  num? totalAmount,
  String? beneficiaryName,
  String? contactName,
  int? remindDaysBefore,
  Map<String, Object?>? payout,
}) => {
  'id': id,
  'kind': kind,
  'shape': shape,
  'direction': direction,
  'title': title,
  'amount': amount,
  'amountVaries': amount == null,
  'recurrence': 'monthly',
  'intervalCount': 1,
  'occurrenceCount': occurrenceCount,
  'totalAmount': totalAmount,
  'beneficiaryName': beneficiaryName,
  'contactName': contactName,
  'status': 'active',
  'remindDaysBefore': remindDaysBefore,
  'remindHour': null,
  'remindersEnabled': true,
  'catalog': catalog,
  'sayHint': kind == 'installment' ? 'دفعت قسط $title' : 'دفعت $title',
  'payout': payout,
  'progress': {
    'paidCount': paidCount,
    'totalCount': totalCount,
    'remainingAmount': remainingAmount,
    'paidAmount': 0,
    'next': next,
    'overdue': overdue,
  },
};

final _netflix = _brand('netflix', 'Netflix', 'نتفليكس');
final _shahid = _brand('shahid', 'Shahid', 'شاهد');

final _flatDue = _due(
  6,
  '2026-11-01',
  'قسط الشقة',
  'property',
  30000,
  status: 'overdue',
  number: 9,
  total: 40,
);
final _netflixDue = _due(
  2,
  '2026-11-12',
  'Netflix',
  'subscription',
  240,
  slug: 'netflix',
);
final _fridgeDue = _due(
  1,
  '2026-11-15',
  'التلاجة',
  'installment',
  2000,
  number: 5,
  total: 12,
);
final _schoolDue = _due(
  3,
  '2026-11-20',
  'مصاريف محمد · مدرسة النيل',
  'school',
  7500,
  label: 'القسط التاني',
);
final _shahidDue = _due(
  7,
  '2026-11-25',
  'Shahid',
  'subscription',
  100,
  slug: 'shahid',
);
final _salaryDue = _due(
  8,
  '2026-11-25',
  'المرتب',
  'salary',
  15000,
  direction: 'in',
);
final _faridaDue = _due(
  4,
  '2026-10-01',
  'سلفة فريدة',
  'debt',
  3000,
  paid: 1000,
  status: 'partial',
  undated: true,
);
final _gam3eyaDue = _due(
  5,
  '2026-11-05',
  'جمعية الشغل',
  'gam3eya',
  1000,
  status: 'paid',
  paid: 1000,
  number: 4,
  total: 10,
);

/// `commitments.overview` for someone with a fridge on installments, Netflix and Shahid, school fees, a debt to
/// their sister, a gam3eya, the flat's installment overdue, and their salary.
Map<String, Object?> sampleCommitmentsOverview() => {
  'today': '2026-11-09',
  'items': [
    _item(
      6,
      'property',
      'fixed',
      'قسط الشقة',
      amount: 30000,
      next: _flatDue,
      paidCount: 8,
      totalCount: 40,
      remainingAmount: 960000,
      overdue: 1,
      occurrenceCount: 40,
    ),
    _item(
      1,
      'installment',
      'fixed',
      'التلاجة',
      amount: 2000,
      next: _fridgeDue,
      paidCount: 4,
      totalCount: 12,
      remainingAmount: 16000,
      occurrenceCount: 12,
    ),
    _item(
      2,
      'subscription',
      'recurring',
      'Netflix',
      amount: 240,
      catalog: _netflix,
      next: _netflixDue,
    ),
    _item(
      7,
      'subscription',
      'recurring',
      'Shahid',
      amount: 100,
      catalog: _shahid,
      next: _shahidDue,
    ),
    _item(
      3,
      'school',
      'schedule',
      'مصاريف محمد · مدرسة النيل',
      next: _schoolDue,
      paidCount: 1,
      totalCount: 3,
      remainingAmount: 15000,
      beneficiaryName: 'محمد',
    ),
    _item(
      4,
      'debt',
      'balance',
      'سلفة فريدة',
      next: _faridaDue,
      remainingAmount: 2000,
      totalAmount: 3000,
      contactName: 'فريدة',
    ),
    _item(
      5,
      'gam3eya',
      'gam3eya',
      'جمعية الشغل',
      amount: 1000,
      paidCount: 4,
      totalCount: 10,
      remainingAmount: 6000,
      occurrenceCount: 10,
      payout: {
        'id': 9,
        'dueDay': '2027-02-05',
        'amount': 10000,
        'status': 'due',
      },
    ),
    _item(
      8,
      'salary',
      'recurring',
      'المرتب',
      amount: 15000,
      direction: 'in',
      next: _salaryDue,
    ),
  ],
  'due': [
    _faridaDue,
    _flatDue,
    _gam3eyaDue,
    _netflixDue,
    _fridgeDue,
    _schoolDue,
    _shahidDue,
    _salaryDue,
  ],
  'summary': {
    'dueThisMonth': 41840,
    'paidThisMonth': 1000,
    'leftThisMonth': 40840,
    'overdue': 1,
    'installmentsLeft': 976000,
  },
};

/// `commitments.detail` of the fridge: four paid, one linked automatically from «دفعت قسط التلاجة 2000».
Map<String, Object?> sampleFridgeDetail() => {
  'today': '2026-11-09',
  'commitment': {
    ...(sampleCommitmentsOverview()['items']! as List<Object?>)[1]!
        as Map<String, Object?>,
    'filing': {
      'type': 'expense',
      'category': 'أقساط وفوايد',
      'subCategory': 'أقساط',
    },
  },
  'dates': [
    _due(
      1,
      '2026-10-15',
      'التلاجة',
      'installment',
      2000,
      status: 'paid',
      paid: 2000,
      number: 4,
      total: 12,
      settlements: [
        {
          'id': 31,
          'amount': 2000,
          'source': 'linked',
          'matchedBy': 'auto',
          'expense': {
            'id': 901,
            'amount': 2000,
            'date': '2026-10-15T10:00:00Z',
            'description': 'دفعت قسط التلاجة',
            'source': 'voice',
          },
        },
      ],
    ),
    _fridgeDue,
    _due(1, '2026-12-15', 'التلاجة', 'installment', 2000, number: 6, total: 12),
    _due(1, '2027-01-15', 'التلاجة', 'installment', 2000, number: 7, total: 12),
  ],
};

/// Every `commitments.*` procedure the app calls, answered as the server does, each mutation checking its input.
void answerSampleCommitments(FakeApi api, {bool withQuestions = false}) {
  api.answer('commitments.overview', (_) => sampleCommitmentsOverview());
  api.answer('commitments.detail', (input) {
    commitmentsInput(input, required: {'id'});
    return sampleFridgeDetail();
  });
  api.answer('commitments.month', (input) {
    // The same dates in whichever month is asked for, so the calendar shows them on its month.
    final month =
        commitmentsInput(input, required: {'month'})['month']! as String;
    return [
      for (final due in [
        _flatDue,
        _gam3eyaDue,
        _netflixDue,
        _fridgeDue,
        _schoolDue,
        _shahidDue,
        _salaryDue,
      ])
        {...due, 'day': '$month-${(due['day']! as String).substring(8)}'},
    ];
  });
  api.answer(
    'commitments.subscriptions',
    (_) => [
      _netflix,
      _shahid,
      _brand('watch_it', 'WATCH IT', 'ووتش إت'),
      _brand('osn_plus', 'OSN+', 'OSN+'),
      _brand('yango_play', 'Yango Play', 'يانجو بلاي'),
      _brand('tod', 'TOD', 'تود'),
      _brand('spotify', 'Spotify', 'سبوتيفاي'),
      _brand('anghami', 'Anghami', 'أنغامي'),
      _brand('youtube_premium', 'YouTube Premium', 'يوتيوب بريميوم'),
      _brand('chatgpt', 'ChatGPT', 'شات جي بي تي'),
      _brand('talabat_pro', 'talabat pro', 'طلبات برو'),
      _brand('icloud', 'iCloud+', 'آي كلاود'),
    ],
  );
  api.answer(
    'commitments.defaults',
    (_) => {'remindDaysBefore': 3, 'remindHour': 10},
  );
  api.answer(
    'commitments.questions',
    (_) => {
      'today': '2026-11-09',
      'dueChecks': withQuestions
          ? [
              {..._flatDue, 'key': 'due:6:2026-11-01'},
            ]
          : <Object?>[],
      'links': <Object?>[],
    },
  );
  api.answer('commitments.create', (input) {
    commitmentsInput(input, required: {'shape', 'kind'}, optional: createKeys);
    return {'id': 10, 'payoutId': null};
  });
  api.answer('commitments.update', (input) {
    commitmentsInput(
      input,
      required: {'id'},
      optional: {
        'title',
        'amount',
        'amountVaries',
        'startDay',
        'endDay',
        'recurrence',
        'intervalCount',
        'occurrenceCount',
        'paidBeforeCount',
        'totalAmount',
        'provider',
        'paymentMethod',
        'category',
        'subCategory',
        'remindDaysBefore',
        'remindHour',
        'remindersEnabled',
      },
    );
    return {'success': true};
  });
  api.answer('commitments.setStatus', (input) {
    commitmentsInput(input, required: {'id', 'status'});
    return {'success': true};
  });
  api.answer('commitments.setOverride', (input) {
    commitmentsInput(
      input,
      required: {'id', 'dueDay', 'action'},
      optional: {'newDay', 'amount'},
    );
    return {'success': true};
  });
  api.answer('commitments.pay', (input) {
    commitmentsInput(
      input,
      required: {'cashflowId', 'dueDay', 'record'},
      optional: {'amount', 'walletId', 'date', 'clientRequestId'},
    );
    return {'expenseId': 950, 'settlementId': 40};
  });
  api.answer('commitments.unlink', (input) {
    commitmentsInput(input, required: {'settlementId'});
    return {'success': true};
  });
  api.answer('commitments.answer', (input) {
    commitmentsInput(input, required: {'key', 'answer'}, optional: {'amount'});
    return {'success': true};
  });
  api.answer('commitments.linksFor', (input) {
    final ids =
        commitmentsInput(input, required: {'expenseIds'})['expenseIds']!
            as List<Object?>;
    return [
      for (final id in ids)
        {
          'expenseId': id,
          'status': 'none',
          'candidates': <Object?>[],
          'settlementIds': <Object?>[],
        },
    ];
  });
  api.answer('commitments.forSentence', (input) {
    commitmentsInput(input, required: {'text'});
    return null;
  });
}
