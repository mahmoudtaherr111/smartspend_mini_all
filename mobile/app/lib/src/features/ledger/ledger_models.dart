/// The ledger as the app reads it from the API: parsed sentences, saved transactions and month totals. Each type
/// reads the JSON the procedure named on it answers with (mobile/AGENTS.md, rule 1), and tolerates what MySQL
/// decimals and optional columns send: amounts as strings, missing or null fields.
library;

/// What `ai.parseExpense` decided about a sentence (`api/lib/smart-pipeline.ts#PipelineResult`).
enum ParseDecision {
  /// Sure enough to save without asking.
  autoSave,

  /// Read, but the person should look before it is saved.
  review,

  /// Something is missing; the server asks a question.
  clarify,
}

/// One transaction read from a sentence (`api/lib/rule-engine.ts#ParsedTransaction`), as `expense.create` takes it.
final class ParsedItem {
  const ParsedItem({
    required this.amount,
    required this.type,
    required this.category,
    this.subCategory,
    this.description,
    this.date,
    this.direction,
    this.personName,
    this.personRelationship,
  });

  factory ParsedItem.fromJson(Map<String, Object?> json) => ParsedItem(
    amount: readAmount(json['amount']) ?? 0,
    type: json['type'] as String? ?? 'expense',
    category: json['category'] as String? ?? '',
    subCategory: json['subCategory'] as String?,
    description: json['description'] as String?,
    date: json['date'] as String?,
    direction: json['direction'] as String?,
    personName: json['person_mentioned'] as String?,
    personRelationship: json['person_relationship'] as String?,
  );

  final num amount;

  /// `expense`, `income`, `transfer` or `investment`.
  final String type;
  final String category;
  final String? subCategory;
  final String? description;
  final String? date;

  /// `incoming` or `outgoing` for transfers and refunds.
  final String? direction;
  final String? personName;
  final String? personRelationship;

  /// The same keys [ParsedItem.fromJson] reads, so an item can wait in the outbox.
  Map<String, Object?> toJson() => {
    'amount': amount,
    'type': type,
    'category': category,
    'subCategory': subCategory,
    'description': description,
    'date': date,
    'direction': direction,
    'person_mentioned': personName,
    'person_relationship': personRelationship,
  };

  /// Whether `expense.create` would accept it (`api/expense-router.ts`: a positive amount and a category).
  bool get isSavable => amount > 0 && category.trim().isNotEmpty;

  /// The direction saved with it: a transfer's when known, and `incoming` for an expense whose money came back
  /// (`contracts/expense-save.ts#directionToSave`).
  String? get directionToSave {
    if (type == 'transfer') {
      return direction == 'incoming' || direction == 'outgoing'
          ? direction
          : null;
    }
    return type == 'expense' && direction == 'incoming' ? 'incoming' : null;
  }

  /// The person linked to a contact, only when both name and relationship are known
  /// (`contracts/expense-save.ts#personToSave`).
  Map<String, String> get personToSave {
    final name = (personName ?? '').trim();
    final relationship = (personRelationship ?? '').trim();
    if (name.isEmpty || relationship.isEmpty) return const {};
    return {
      'personName': name.length > 60 ? name.substring(0, 60) : name,
      'personRelationship': relationship.length > 40
          ? relationship.substring(0, 40)
          : relationship,
    };
  }

  /// «أكل وشرب» or «مواصلات/أوبر» when the subcategory says more than «عام».
  String get categoryLabel {
    final sub = subCategory?.trim();
    return sub == null || sub.isEmpty || sub == 'عام'
        ? category
        : '$category/$sub';
  }
}

/// `ai.parseExpense`'s answer.
final class ParseResult {
  const ParseResult({
    required this.decision,
    required this.items,
    this.clarificationQuestion,
    this.clarificationId,
    this.classificationLogId,
    this.alertMessage,
  });

  factory ParseResult.fromJson(Map<String, Object?> json) => ParseResult(
    decision: switch (json['decision']) {
      'auto_save' => ParseDecision.autoSave,
      'clarify' => ParseDecision.clarify,
      _ => ParseDecision.review,
    },
    items: [
      for (final item in json['items'] as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) ParsedItem.fromJson(item),
    ],
    clarificationQuestion: json['clarificationQuestion'] as String?,
    clarificationId: (json['clarificationId'] as num?)?.toInt(),
    classificationLogId: (json['classificationLogId'] as num?)?.toInt(),
    alertMessage: json['alertMessage'] as String?,
  );

  final ParseDecision decision;
  final List<ParsedItem> items;
  final String? clarificationQuestion;

  /// The pending question on the server, answered with `expense.answerClarification`.
  final int? clarificationId;

  /// The parse's trace, saved with the items so a correction can teach the classifier.
  final int? classificationLogId;

  /// A note the pipeline wants the person to read, such as an amount it was unsure of.
  final String? alertMessage;

  /// The same keys [ParseResult.fromJson] reads, so a parse can wait in the outbox for the person.
  Map<String, Object?> toJson() => {
    'decision': switch (decision) {
      ParseDecision.autoSave => 'auto_save',
      ParseDecision.review => 'review',
      ParseDecision.clarify => 'clarify',
    },
    'items': [for (final item in items) item.toJson()],
    'clarificationQuestion': clarificationQuestion,
    'clarificationId': clarificationId,
    'classificationLogId': classificationLogId,
    'alertMessage': alertMessage,
  };
}

/// `expense.answerClarification`'s answer: saved, or another question.
final class ClarificationResult {
  const ClarificationResult({
    required this.savedIds,
    required this.savedItems,
    this.nextQuestion,
    this.clarificationId,
  });

  factory ClarificationResult.fromJson(Map<String, Object?> json) {
    final saved = [
      for (final entry in json['saved'] as List<Object?>? ?? const [])
        if (entry is Map<String, Object?>) entry,
    ];
    return ClarificationResult(
      savedIds: [
        for (final entry in saved)
          if (entry['id'] case final num id) id.toInt(),
      ],
      savedItems: [for (final entry in saved) ParsedItem.fromJson(entry)],
      nextQuestion: json['needsClarification'] == true
          ? json['clarificationQuestion'] as String?
          : null,
      clarificationId: (json['clarificationId'] as num?)?.toInt(),
    );
  }

  final List<int> savedIds;
  final List<ParsedItem> savedItems;

  /// Set when the server needs one more answer.
  final String? nextQuestion;
  final int? clarificationId;
}

/// A saved transaction, a row of `expenses` as `expense.list` or `expense.getById` returns it.
final class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.amount,
    required this.type,
    required this.category,
    required this.date,
    this.subCategory,
    this.description,
    this.rawText,
    this.source,
    this.walletId,
    this.contactId,
  });

  factory LedgerEntry.fromJson(Map<String, Object?> json) => LedgerEntry(
    id: (json['id'] as num).toInt(),
    amount: readAmount(json['amount']) ?? 0,
    type: json['type'] as String? ?? 'expense',
    category: json['category'] as String? ?? '',
    subCategory: json['subCategory'] as String?,
    description: json['description'] as String?,
    rawText: json['rawText'] as String?,
    source: json['source'] as String?,
    walletId: (json['walletId'] as num?)?.toInt(),
    contactId: (json['contactId'] as num?)?.toInt(),
    date:
        DateTime.tryParse(
          json['date'] as String? ?? json['createdAt'] as String? ?? '',
        )?.toLocal() ??
        DateTime.fromMillisecondsSinceEpoch(0),
  );

  final int id;

  /// Negative for a refund: money that came back to its category (docs/decisions/0010-refunds-net-their-category.md).
  final num amount;
  final String type;
  final String category;
  final String? subCategory;
  final String? description;
  final String? rawText;

  /// How it was recorded: `ai_parsed`, `manual`, `voice`, `sms` or `image`.
  final String? source;
  final int? walletId;
  final int? contactId;

  /// When it happened, in the phone's time.
  final DateTime date;

  /// Money returned to an expense category (`type == 'expense'` with a negative amount).
  bool get isRefund => type == 'expense' && amount < 0;

  /// The same keys [LedgerEntry.fromJson] reads, for the copy kept for offline use.
  Map<String, Object?> toJson() => {
    'id': id,
    'amount': amount,
    'type': type,
    'category': category,
    'subCategory': subCategory,
    'description': description,
    'rawText': rawText,
    'source': source,
    'walletId': walletId,
    'contactId': contactId,
    'date': date.toUtc().toIso8601String(),
  };

  /// What the row is called: the description the parser wrote, else the subcategory, else the category.
  String get title {
    for (final candidate in [description, subCategory, category]) {
      final value = candidate?.trim();
      if (value != null && value.isNotEmpty && value != 'عام') return value;
    }
    return category;
  }
}

/// A person from `profile.listContacts`, linked to transactions by `contactId`.
final class ContactSummary {
  const ContactSummary({
    required this.id,
    required this.name,
    this.relation,
    this.transactionCount = 0,
  });

  factory ContactSummary.fromJson(Map<String, Object?> json) => ContactSummary(
    id: (json['id'] as num).toInt(),
    name: json['name'] as String? ?? '',
    relation: json['relation'] as String?,
    transactionCount: (json['transactionCount'] as num?)?.toInt() ?? 0,
  );

  final int id;
  final String name;
  final String? relation;
  final int transactionCount;
}

/// A sentence waiting on the server for an answer (`expense.getPendingClarifications`).
final class PendingClarification {
  const PendingClarification({
    required this.id,
    required this.originalText,
    required this.question,
    this.createdAt,
  });

  factory PendingClarification.fromJson(Map<String, Object?> json) =>
      PendingClarification(
        id: (json['id'] as num).toInt(),
        originalText: json['originalText'] as String? ?? '',
        question: json['question'] as String? ?? '',
        createdAt: switch (json['createdAt']) {
          final String value => DateTime.tryParse(value)?.toLocal(),
          _ => null,
        },
      );

  final int id;
  final String originalText;
  final String question;
  final DateTime? createdAt;
}

/// A page of `expense.list`.
final class LedgerPage {
  const LedgerPage({required this.entries, required this.total});

  factory LedgerPage.fromJson(Map<String, Object?> json) => LedgerPage(
    entries: [
      for (final item in json['items'] as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) LedgerEntry.fromJson(item),
    ],
    total: (json['total'] as num?)?.toInt() ?? 0,
  );

  final List<LedgerEntry> entries;

  /// How many entries match in all, across every page.
  final int total;

  Map<String, Object?> toJson() => {
    'items': [for (final entry in entries) entry.toJson()],
    'total': total,
  };
}

/// `expense.getMonthSummary`: the month's totals from the daily rollups.
final class MonthSummary {
  const MonthSummary({
    required this.income,
    required this.expense,
    required this.count,
  });

  factory MonthSummary.fromJson(Map<String, Object?> json) => MonthSummary(
    income: readAmount(json['totalIncome']) ?? 0,
    expense: readAmount(json['totalExpense']) ?? 0,
    count: (json['count'] as num?)?.toInt() ?? 0,
  );

  final num income;
  final num expense;
  final int count;

  num get net => income - expense;

  Map<String, Object?> toJson() => {
    'totalIncome': income,
    'totalExpense': expense,
    'count': count,
  };
}

/// An amount as the API sends it: a number, or a MySQL decimal as a string ("185.00").
num? readAmount(Object? value) => switch (value) {
  final num number => number,
  final String text => num.tryParse(text),
  _ => null,
};
