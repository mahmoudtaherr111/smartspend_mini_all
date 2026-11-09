import 'package:flutter/foundation.dart';

import '../ledger/ledger_models.dart' show readAmount;

/// The five logics a commitment follows (docs/decisions/0051-commitments-ecosystem.md).
enum CommitmentShape { fixed, schedule, recurring, balance, gam3eya }

CommitmentShape shapeOf(String? value) => switch (value) {
  'fixed' => CommitmentShape.fixed,
  'schedule' => CommitmentShape.schedule,
  'balance' => CommitmentShape.balance,
  'gam3eya' => CommitmentShape.gam3eya,
  _ => CommitmentShape.recurring,
};

int? _int(Object? value) => (value as num?)?.toInt();
String? _string(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

/// A known service's brand from the server's catalog (Netflix, Shahid…); the admin can set its logo and colour.
@immutable
class CatalogBrand {
  const CatalogBrand({
    required this.slug,
    required this.name,
    required this.nameAr,
    this.brandColor,
    this.logoUrl,
    this.cycle = 'monthly',
  });

  factory CatalogBrand.fromJson(Map<String, Object?> json) => CatalogBrand(
    slug: json['slug'] as String? ?? '',
    name: json['name'] as String? ?? '',
    nameAr: json['nameAr'] as String? ?? '',
    brandColor: _string(json['brandColor']),
    logoUrl: _string(json['logoUrl']),
    cycle: json['cycle'] as String? ?? 'monthly',
  );

  final String slug;
  final String name;
  final String nameAr;
  final String? brandColor;
  final String? logoUrl;
  final String cycle;
}

/// One due date of a commitment, with its status as the server decided it (mobile rule 8).
@immutable
class DueDate {
  const DueDate({
    required this.cashflowId,
    required this.dueDay,
    required this.day,
    required this.title,
    required this.kind,
    required this.direction,
    required this.status,
    this.amount,
    this.paid = 0,
    this.remaining,
    this.number,
    this.total,
    this.label,
    this.estimated = false,
    this.undated = false,
    this.key,
    this.settlements = const [],
    this.catalogSlug,
    this.brandColor,
    this.logoUrl,
  });

  factory DueDate.fromJson(Map<String, Object?> json) => DueDate(
    cashflowId: _int(json['cashflowId']) ?? 0,
    dueDay: json['dueDay'] as String? ?? '',
    day:
        json['day'] as String? ??
        json['effectiveDay'] as String? ??
        json['dueDay'] as String? ??
        '',
    title: json['title'] as String? ?? '',
    kind: json['kind'] as String? ?? 'other',
    direction: json['direction'] as String? ?? 'out',
    status: json['status'] as String? ?? 'due',
    amount: readAmount(json['amount']),
    paid: readAmount(json['paid']) ?? 0,
    remaining: readAmount(json['remaining']),
    number: _int(json['number']),
    total: _int(json['total']),
    label: _string(json['label']),
    estimated: json['estimated'] == true,
    undated: json['undated'] == true,
    key: _string(json['key']),
    settlements: [
      for (final raw in json['settlements'] as List<Object?>? ?? const [])
        if (raw is Map<String, Object?>) LinkedPayment.fromJson(raw),
    ],
    catalogSlug: _string(json['catalogSlug']),
    brandColor: _string(json['brandColor']),
    logoUrl: _string(json['logoUrl']),
  );

  final int cashflowId;

  /// The key the server's payments use; [day] is when it is due after a move.
  final String dueDay;
  final String day;
  final String title;
  final String kind;
  final String direction;

  /// paid | partial | due | overdue | unconfirmed | skipped
  final String status;
  final num? amount;
  final num paid;
  final num? remaining;
  final int? number;
  final int? total;
  final String? label;
  final bool estimated;
  final bool undated;

  /// The question key of an app-open "اتدفع؟".
  final String? key;
  final List<LinkedPayment> settlements;
  final String? catalogSlug;
  final String? brandColor;
  final String? logoUrl;

  bool get isPaid => status == 'paid';
  bool get isOpen => status != 'paid' && status != 'skipped';
  bool get isIncome => direction == 'in';
}

/// A payment linked to a due date, and how it got there.
@immutable
class LinkedPayment {
  const LinkedPayment({
    required this.id,
    required this.amount,
    required this.source,
    required this.matchedBy,
    this.expenseId,
    this.expenseSource,
    this.description,
    this.date,
  });

  factory LinkedPayment.fromJson(Map<String, Object?> json) {
    final expense = json['expense'] as Map<String, Object?>?;
    return LinkedPayment(
      id: _int(json['id']) ?? 0,
      amount: readAmount(json['amount']) ?? 0,
      source: json['source'] as String? ?? 'linked',
      matchedBy: json['matchedBy'] as String? ?? 'user',
      expenseId: _int(expense?['id']),
      expenseSource: _string(expense?['source']),
      description: _string(expense?['description']),
      date: DateTime.tryParse(expense?['date'] as String? ?? '')?.toLocal(),
    );
  }

  final int id;
  final num amount;

  /// linked | declared
  final String source;

  /// user | auto | question | voice | chat
  final String matchedBy;
  final int? expenseId;

  /// voice | manual | sms | image…
  final String? expenseSource;
  final String? description;
  final DateTime? date;
}

@immutable
class CommitmentProgress {
  const CommitmentProgress({
    this.paidCount,
    this.totalCount,
    this.remainingAmount,
    this.paidAmount = 0,
    this.next,
    this.lastDay,
    this.overdue = 0,
  });

  factory CommitmentProgress.fromJson(Map<String, Object?> json) {
    final next = json['next'];
    return CommitmentProgress(
      paidCount: _int(json['paidCount']),
      totalCount: _int(json['totalCount']),
      remainingAmount: readAmount(json['remainingAmount']),
      paidAmount: readAmount(json['paidAmount']) ?? 0,
      next: next is Map<String, Object?> ? DueDate.fromJson(next) : null,
      lastDay: _string(json['lastDay']),
      overdue: _int(json['overdue']) ?? 0,
    );
  }

  final int? paidCount;
  final int? totalCount;
  final num? remainingAmount;
  final num paidAmount;
  final DueDate? next;
  final String? lastDay;
  final int overdue;

  double? get fraction => paidCount != null && (totalCount ?? 0) > 0
      ? (paidCount! / totalCount!).clamp(0.0, 1.0)
      : null;
}

/// A commitment as the hub and its page show it.
@immutable
class Commitment {
  const Commitment({
    required this.id,
    required this.kind,
    required this.shape,
    required this.direction,
    required this.title,
    required this.progress,
    this.amount,
    this.amountVaries = false,
    this.estimatedAmount,
    this.recurrence = 'monthly',
    this.intervalCount = 1,
    this.startDay,
    this.occurrenceCount,
    this.totalAmount,
    this.provider,
    this.contactName,
    this.beneficiaryName,
    this.gam3eyaTurn,
    this.status = 'active',
    this.remindDaysBefore,
    this.remindHour,
    this.remindersEnabled = true,
    this.catalog,
    this.sayHint,
    this.payoutDay,
    this.payoutAmount,
  });

  factory Commitment.fromJson(Map<String, Object?> json) {
    final catalog = json['catalog'];
    final payout = json['payout'] as Map<String, Object?>?;
    return Commitment(
      id: _int(json['id']) ?? 0,
      kind: json['kind'] as String? ?? 'other',
      shape: shapeOf(json['shape'] as String?),
      direction: json['direction'] as String? ?? 'out',
      title: json['title'] as String? ?? '',
      amount: readAmount(json['amount']),
      amountVaries: json['amountVaries'] == true,
      estimatedAmount: readAmount(json['estimatedAmount']),
      recurrence: json['recurrence'] as String? ?? 'monthly',
      intervalCount: _int(json['intervalCount']) ?? 1,
      startDay: _string(json['startDay']),
      occurrenceCount: _int(json['occurrenceCount']),
      totalAmount: readAmount(json['totalAmount']),
      provider: _string(json['provider']),
      contactName: _string(json['contactName']),
      beneficiaryName: _string(json['beneficiaryName']),
      gam3eyaTurn: _int(json['gam3eyaTurn']),
      status: json['status'] as String? ?? 'active',
      remindDaysBefore: _int(json['remindDaysBefore']),
      remindHour: _int(json['remindHour']),
      remindersEnabled: json['remindersEnabled'] != false,
      catalog: catalog is Map<String, Object?>
          ? CatalogBrand.fromJson(catalog)
          : null,
      sayHint: _string(json['sayHint']),
      progress: CommitmentProgress.fromJson(
        json['progress'] as Map<String, Object?>? ?? const {},
      ),
      payoutDay: _string(payout?['dueDay']),
      payoutAmount: readAmount(payout?['amount']),
    );
  }

  final int id;
  final String kind;
  final CommitmentShape shape;
  final String direction;
  final String title;
  final num? amount;
  final bool amountVaries;
  final num? estimatedAmount;
  final String recurrence;
  final int intervalCount;
  final String? startDay;
  final int? occurrenceCount;
  final num? totalAmount;
  final String? provider;
  final String? contactName;
  final String? beneficiaryName;
  final int? gam3eyaTurn;
  final String status;
  final int? remindDaysBefore;
  final int? remindHour;
  final bool remindersEnabled;
  final CatalogBrand? catalog;
  final String? sayHint;
  final CommitmentProgress progress;
  final String? payoutDay;
  final num? payoutAmount;

  bool get isIncome => direction == 'in';

  /// The filter group it shows under in the hub.
  CommitmentGroup get group => switch (kind) {
    'installment' ||
    'loan' ||
    'property' ||
    'card' => CommitmentGroup.installments,
    'school' || 'university' || 'lessons' => CommitmentGroup.education,
    'debt' => CommitmentGroup.debts,
    'gam3eya' => CommitmentGroup.gam3eya,
    'salary' || 'freelance' => CommitmentGroup.income,
    _ => isIncome ? CommitmentGroup.income : CommitmentGroup.bills,
  };
}

enum CommitmentGroup { installments, bills, education, debts, gam3eya, income }

@immutable
class CommitmentsSummary {
  const CommitmentsSummary({
    this.dueThisMonth = 0,
    this.paidThisMonth = 0,
    this.leftThisMonth = 0,
    this.overdue = 0,
    this.installmentsLeft = 0,
  });

  factory CommitmentsSummary.fromJson(Map<String, Object?> json) =>
      CommitmentsSummary(
        dueThisMonth: readAmount(json['dueThisMonth']) ?? 0,
        paidThisMonth: readAmount(json['paidThisMonth']) ?? 0,
        leftThisMonth: readAmount(json['leftThisMonth']) ?? 0,
        overdue: _int(json['overdue']) ?? 0,
        installmentsLeft: readAmount(json['installmentsLeft']) ?? 0,
      );

  final num dueThisMonth;
  final num paidThisMonth;
  final num leftThisMonth;
  final int overdue;
  final num installmentsLeft;
}

/// `commitments.overview`.
@immutable
class CommitmentsOverview {
  const CommitmentsOverview({
    required this.today,
    this.items = const [],
    this.due = const [],
    this.summary = const CommitmentsSummary(),
  });

  factory CommitmentsOverview.fromJson(Map<String, Object?> json) =>
      CommitmentsOverview(
        today: json['today'] as String? ?? '',
        items: [
          for (final raw in json['items'] as List<Object?>? ?? const [])
            if (raw is Map<String, Object?>) Commitment.fromJson(raw),
        ],
        due: [
          for (final raw in json['due'] as List<Object?>? ?? const [])
            if (raw is Map<String, Object?>) DueDate.fromJson(raw),
        ],
        summary: CommitmentsSummary.fromJson(
          json['summary'] as Map<String, Object?>? ?? const {},
        ),
      );

  final String today;
  final List<Commitment> items;
  final List<DueDate> due;
  final CommitmentsSummary summary;
}

/// `commitments.detail`.
@immutable
class CommitmentDetail {
  const CommitmentDetail({
    required this.today,
    required this.commitment,
    this.dates = const [],
    this.filingCategory,
    this.filingSubCategory,
  });

  factory CommitmentDetail.fromJson(Map<String, Object?> json) {
    final commitment = json['commitment'] as Map<String, Object?>? ?? const {};
    final filing = commitment['filing'] as Map<String, Object?>? ?? const {};
    return CommitmentDetail(
      today: json['today'] as String? ?? '',
      commitment: Commitment.fromJson(commitment),
      dates: [
        for (final raw in json['dates'] as List<Object?>? ?? const [])
          if (raw is Map<String, Object?>) DueDate.fromJson(raw),
      ],
      filingCategory: _string(filing['category']),
      filingSubCategory: _string(filing['subCategory']),
    );
  }

  final String today;
  final Commitment commitment;
  final List<DueDate> dates;

  /// Where its payments are filed in the ledger: «أقساط وفوايد › أقساط».
  final String? filingCategory;
  final String? filingSubCategory;
}

/// A choice offered for a payment that may pay one of several commitments.
@immutable
class LinkCandidate {
  const LinkCandidate({
    required this.cashflowId,
    required this.title,
    required this.dueDay,
    this.amount,
  });

  factory LinkCandidate.fromJson(Map<String, Object?> json) => LinkCandidate(
    cashflowId: _int(json['cashflowId']) ?? 0,
    title: json['title'] as String? ?? '',
    dueDay: json['dueDay'] as String? ?? '',
    amount: readAmount(json['amount']),
  );

  final int cashflowId;
  final String title;
  final String dueDay;
  final num? amount;

  String get answer => '$cashflowId:$dueDay';
}

/// What the server did with a payment just saved (`commitments.linksFor`).
@immutable
class CommitmentLink {
  const CommitmentLink({
    required this.expenseId,
    required this.status,
    this.cashflowId,
    this.title,
    this.number,
    this.total,
    this.remainingAmount,
    this.settlementIds = const [],
    this.questionKey,
    this.candidates = const [],
  });

  factory CommitmentLink.fromJson(Map<String, Object?> json) => CommitmentLink(
    expenseId: _int(json['expenseId']) ?? 0,
    status: json['status'] as String? ?? 'none',
    cashflowId: _int(json['cashflowId']),
    title: _string(json['title']),
    number: _int(json['number']),
    total: _int(json['total']),
    remainingAmount: readAmount(json['remainingAmount']),
    settlementIds: [
      for (final id in json['settlementIds'] as List<Object?>? ?? const [])
        if (id is num) id.toInt(),
    ],
    questionKey: _string(json['questionKey']),
    candidates: [
      for (final raw in json['candidates'] as List<Object?>? ?? const [])
        if (raw is Map<String, Object?>) LinkCandidate.fromJson(raw),
    ],
  );

  final int expenseId;

  /// linked | ask | none
  final String status;
  final int? cashflowId;
  final String? title;
  final int? number;
  final int? total;
  final num? remainingAmount;
  final List<int> settlementIds;
  final String? questionKey;
  final List<LinkCandidate> candidates;
}

/// A payment waiting for "which commitment is it?".
@immutable
class LinkQuestion {
  const LinkQuestion({
    required this.key,
    required this.amount,
    this.description,
    this.candidates = const [],
  });

  factory LinkQuestion.fromJson(Map<String, Object?> json) {
    final expense = json['expense'] as Map<String, Object?>? ?? const {};
    return LinkQuestion(
      key: json['key'] as String? ?? '',
      amount: readAmount(expense['amount']) ?? 0,
      description: _string(expense['description']),
      candidates: [
        for (final raw in json['candidates'] as List<Object?>? ?? const [])
          if (raw is Map<String, Object?>) LinkCandidate.fromJson(raw),
      ],
    );
  }

  final String key;
  final num amount;
  final String? description;
  final List<LinkCandidate> candidates;
}

/// `commitments.questions`: what the app asks when it opens.
@immutable
class CommitmentQuestions {
  const CommitmentQuestions({this.dueChecks = const [], this.links = const []});

  factory CommitmentQuestions.fromJson(Map<String, Object?> json) =>
      CommitmentQuestions(
        dueChecks: [
          for (final raw in json['dueChecks'] as List<Object?>? ?? const [])
            if (raw is Map<String, Object?>) DueDate.fromJson(raw),
        ],
        links: [
          for (final raw in json['links'] as List<Object?>? ?? const [])
            if (raw is Map<String, Object?>) LinkQuestion.fromJson(raw),
        ],
      );

  final List<DueDate> dueChecks;
  final List<LinkQuestion> links;

  bool get isEmpty => dueChecks.isEmpty && links.isEmpty;
}

/// A sentence naming a commitment without an amount ("دفعت نتفليكس"): what one button would pay.
@immutable
class SentenceCommitment {
  const SentenceCommitment({
    required this.cashflowId,
    required this.title,
    required this.dueDay,
    this.amount,
    this.number,
    this.total,
  });

  factory SentenceCommitment.fromJson(Map<String, Object?> json) =>
      SentenceCommitment(
        cashflowId: _int(json['cashflowId']) ?? 0,
        title: json['title'] as String? ?? '',
        dueDay: json['dueDay'] as String? ?? '',
        amount: readAmount(json['amount']),
        number: _int(json['number']),
        total: _int(json['total']),
      );

  final int cashflowId;
  final String title;
  final String dueDay;
  final num? amount;
  final int? number;
  final int? total;
}
