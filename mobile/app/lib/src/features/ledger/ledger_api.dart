import 'dart:math';

import 'package:smartspend_api/smartspend_api.dart';

import 'ledger_models.dart';

/// The ledger procedures the app calls, as `src/components/expenses/ExpenseForm.tsx`, `RecentExpenses.tsx` and
/// `src/pages/Home.tsx` call them on the web, so a sentence is read, saved and undone the same way on both.
class LedgerApi {
  LedgerApi(this._client, {Random? random})
    : _random = random ?? Random.secure();

  final TrpcClient _client;
  final Random _random;

  /// Reads a typed sentence: `ai.parseExpense`.
  Future<ParseResult> parse(String text) async {
    final data = await _client.mutate(
      Procedures.ai.parseExpense,
      input: {'text': text, 'inputChannel': 'text'},
    );
    return ParseResult.fromJson(_object(data));
  }

  /// Saves [items] read from [rawText] and returns their ids. One item goes through `expense.create`, several
  /// through `expense.batchCreate`. Every item carries a request id the server deduplicates on, so a save retried
  /// after a lost answer is not saved twice.
  Future<List<int>> save(
    List<ParsedItem> items, {
    required String rawText,
    int? classificationLogId,
  }) async {
    final requestId = newRequestId();
    Map<String, Object?> payload(ParsedItem item, String id) => {
      'amount': item.amount,
      'type': item.type,
      'category': item.category,
      'subCategory': ?item.subCategory,
      'description': ?item.description,
      'rawText': rawText,
      'source': 'ai_parsed',
      'date': ?item.date,
      'classificationLogId': ?classificationLogId,
      'direction': ?item.directionToSave,
      ...item.personToSave,
      'clientRequestId': id,
    };

    if (items.length == 1) {
      final data = await _client.mutate(
        Procedures.expense.create,
        input: payload(items.single, requestId),
      );
      final id = _object(data)['id'];
      return id is num ? [id.toInt()] : const [];
    }
    final data = await _client.mutate(
      Procedures.expense.batchCreate,
      input: [
        for (final (index, item) in items.indexed)
          payload(item, '$requestId:$index'),
      ],
    );
    return [
      for (final id in _object(data)['ids'] as List<Object?>? ?? const [])
        if (id is num) id.toInt(),
    ];
  }

  /// Answers the server's question about a sentence: `expense.answerClarification`.
  Future<ClarificationResult> answer(int clarificationId, String answer) async {
    final data = await _client.mutate(
      Procedures.expense.answerClarification,
      input: {'clarificationId': clarificationId, 'answer': answer},
    );
    return ClarificationResult.fromJson(_object(data));
  }

  /// Removes a saved transaction: `expense.delete`.
  Future<void> delete(int id) =>
      _client.mutate(Procedures.expense.delete, input: {'id': id});

  /// The newest transactions first: `expense.list`. [before] continues after the last id of the previous page.
  Future<LedgerPage> list({int limit = 30, int? before}) async {
    final data = await _client.query(
      Procedures.expense.list,
      input: {'limit': limit, 'cursor': ?before},
    );
    return LedgerPage.fromJson(_object(data));
  }

  /// The totals of [month] ("2026-10"), counted from [salaryDay] when the person's month starts on payday:
  /// `expense.getMonthSummary`.
  Future<MonthSummary> monthSummary(String month, {int? salaryDay}) async {
    final data = await _client.query(
      Procedures.expense.getMonthSummary,
      input: {'month': month, 'salaryDay': ?salaryDay},
    );
    return MonthSummary.fromJson(_object(data));
  }

  /// The person's payday when their month starts on it, from the smart profile (`profile.getSmartProfile`), as
  /// `src/pages/Home.tsx` reads it.
  Future<int?> salaryDay() async {
    final data = await _client.query(Procedures.profile.getSmartProfile);
    if (data is! Map<String, Object?>) return null;
    final info = data['financialInfo'];
    if (info is! Map<String, Object?> || info['hasFixedSalary'] != true) {
      return null;
    }
    final day = switch (info['salaryDay']) {
      final num value => value.toInt(),
      final String value => int.tryParse(value),
      _ => null,
    };
    return day != null && day >= 1 && day <= 31 ? day : null;
  }

  /// A random id for one save, 32 hex characters (the server allows 64).
  String newRequestId() => [
    for (var i = 0; i < 16; i++)
      _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ].join();

  static Map<String, Object?> _object(Object? data) =>
      data is Map<String, Object?> ? data : const {};
}

/// The month that holds [now], as "YYYY-MM": with a payday after the 1st, a month runs from payday to payday and is
/// named after the month it starts in, so before payday today belongs to last month's cycle
/// (`src/pages/Home.tsx#currentMonthValue`, `api/services/financial-month.ts`).
String currentMonthKey(DateTime now, {int? salaryDay}) {
  final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
  final beforePayday =
      salaryDay != null &&
      salaryDay > 1 &&
      now.day < min(salaryDay, daysInMonth);
  final start = DateTime(now.year, now.month - (beforePayday ? 1 : 0));
  return '${start.year}-${start.month.toString().padLeft(2, '0')}';
}
