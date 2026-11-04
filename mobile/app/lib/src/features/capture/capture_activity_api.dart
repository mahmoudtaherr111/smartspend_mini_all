import 'package:smartspend_api/smartspend_api.dart';

import '../ledger/ledger_models.dart';

final class CaptureActivityItem {
  const CaptureActivityItem({
    required this.key,
    required this.state,
    this.eventId,
    this.expenseId,
    this.amount,
    this.canUndo = false,
  });
  factory CaptureActivityItem.fromJson(Map<String, Object?> json) =>
      CaptureActivityItem(
        key: json['key'] as String? ?? '',
        state: json['state'] as String? ?? 'waiting',
        eventId: (json['eventId'] as num?)?.toInt(),
        expenseId: (json['expenseId'] as num?)?.toInt(),
        amount: readAmount(json['amountEgp']),
        canUndo: json['canUndo'] == true,
      );
  final String key;
  final String state;
  final int? eventId;
  final int? expenseId;
  final num? amount;
  final bool canUndo;
}

final class PurposeCategory {
  const PurposeCategory(this.id, this.name, this.subcategories);
  factory PurposeCategory.fromJson(Map<String, Object?> json) =>
      PurposeCategory(json['id'] as String, json['name'] as String, [
        for (final item in json['subcategories'] as List<Object?>? ?? const [])
          if (item is Map<String, Object?>)
            PurposeSubcategory(item['id'] as String, item['name'] as String),
      ]);
  final String id;
  final String name;
  final List<PurposeSubcategory> subcategories;
}

final class PurposeSubcategory {
  const PurposeSubcategory(this.id, this.name);
  final String id;
  final String name;
}

final class CapturePurposeQuestion {
  const CapturePurposeQuestion({
    required this.id,
    required this.expenseId,
    required this.title,
    required this.amount,
    required this.fee,
    required this.incoming,
    required this.categories,
  });
  factory CapturePurposeQuestion.fromJson(Map<String, Object?> json) =>
      CapturePurposeQuestion(
        id: (json['questionId'] as num).toInt(),
        expenseId: (json['expenseId'] as num).toInt(),
        title: json['title'] as String? ?? '',
        amount: readAmount(json['amountEgp']) ?? 0,
        fee: readAmount(json['feeEgp']) ?? 0,
        incoming: json['direction'] == 'in',
        categories: [
          for (final item in json['categories'] as List<Object?>? ?? const [])
            if (item is Map<String, Object?>) PurposeCategory.fromJson(item),
        ],
      );
  final int id;
  final int expenseId;
  final String title;
  final num amount;
  final num fee;
  final bool incoming;
  final List<PurposeCategory> categories;
}

/// All money changes still go through the shared server procedures.
final class CaptureActivityApi {
  const CaptureActivityApi(this._client);
  final TrpcClient _client;
  Future<List<CaptureActivityItem>> activity() async {
    final raw = await _client.query(
      Procedures.capture.activity,
      input: {'limit': 8},
    );
    return [
      for (final item in raw is List<Object?> ? raw : const [])
        if (item is Map<String, Object?>) CaptureActivityItem.fromJson(item),
    ];
  }

  Future<CapturePurposeQuestion?> nextQuestion() async {
    final raw = await _client.mutate(Procedures.capture.nextQuestion);
    return raw is Map<String, Object?>
        ? CapturePurposeQuestion.fromJson(raw)
        : null;
  }

  Future<void> answer(
    int questionId, {
    required String action,
    String? categoryId,
    String? subCategoryId,
    String? purpose,
    String? movementKind,
    int? contactId,
  }) => _client.mutate(
    Procedures.capture.answerQuestion,
    input: {
      'questionId': questionId,
      'action': action,
      'categoryId': ?categoryId,
      'subCategoryId': ?subCategoryId,
      'purpose': ?purpose,
      'movementKind': ?movementKind,
      'contactId': ?contactId,
    },
  );
  Future<void> undo(int eventId) => _client.mutate(
    Procedures.capture.answer,
    input: {'eventId': eventId, 'action': 'undo'},
  );
  Future<void> setWalletKind(int walletId, String kind) => _client.mutate(
    Procedures.capture.setWalletKind,
    input: {'walletId': walletId, 'kind': kind},
  );
}
