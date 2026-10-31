import 'dart:math';

import 'package:smartspend_api/smartspend_api.dart';

import 'ledger_models.dart';

/// Sentinel for an optional nullable field (`walletId`, `contactId`) left untouched in [LedgerApi.update].
const Object unchangedField = _UnchangedField();

final class _UnchangedField {
  const _UnchangedField();
}

/// The ledger procedures the app calls, as `src/components/expenses/ExpenseForm.tsx`, `RecentExpenses.tsx`,
/// `EditExpenseDialog.tsx`, `PendingQuestionsCard.tsx` and `src/pages/Home.tsx` call them on the web.
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
  /// through `expense.batchCreate`. Every item carries a request id the server deduplicates on (`[requestId]`, or
  /// `[requestId]:index` for several), so a save retried after a lost answer is not saved twice; pass the same
  /// [requestId] on every retry of one sentence.
  Future<List<int>> save(
    List<ParsedItem> items, {
    required String rawText,
    int? classificationLogId,
    String? requestId,
  }) async {
    final baseId = requestId ?? newRequestId();
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
        input: payload(items.single, baseId),
      );
      final id = _object(data)['id'];
      return id is num ? [id.toInt()] : const [];
    }
    final data = await _client.mutate(
      Procedures.expense.batchCreate,
      input: [
        for (final (index, item) in items.indexed)
          payload(item, '$baseId:$index'),
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

  /// Sentences waiting on the server for an answer: `expense.getPendingClarifications`.
  Future<List<PendingClarification>> pendingClarifications() async {
    final data = await _client.query(
      Procedures.expense.getPendingClarifications,
    );
    return [
      for (final item in data as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) PendingClarification.fromJson(item),
    ];
  }

  /// Dismisses a pending question without recording the sentence: `expense.dismissClarification`.
  Future<void> dismissClarification(int clarificationId) => _client.mutate(
    Procedures.expense.dismissClarification,
    input: {'clarificationId': clarificationId},
  );

  /// Reads one saved transaction by [id], or null when it no longer exists: `expense.getById`.
  Future<LedgerEntry?> getById(int id) async {
    final data = await _client.query(
      Procedures.expense.getById,
      input: {'id': id},
    );
    return data is Map<String, Object?> ? LedgerEntry.fromJson(data) : null;
  }

  /// Edits a saved transaction: `expense.update`. Passing `null` to [walletId] or [contactId] unlinks it; leaving it
  /// at [unchangedField] keeps whatever the server already has.
  Future<void> update({
    required int id,
    num? amount,
    String? type,
    bool? refund,
    String? category,
    String? subCategory,
    String? description,
    String? date,
    Object? walletId = unchangedField,
    Object? contactId = unchangedField,
  }) async {
    final input = <String, Object?>{
      'id': id,
      'amount': ?amount,
      'type': ?type,
      'refund': ?refund,
      'category': ?category,
      'subCategory': ?subCategory,
      'description': ?description,
      'date': ?date,
      if (!identical(walletId, unchangedField)) 'walletId': walletId as int?,
      if (!identical(contactId, unchangedField)) 'contactId': contactId as int?,
    };
    await _client.mutate(Procedures.expense.update, input: input);
  }

  /// Removes a saved transaction: `expense.delete`.
  Future<void> delete(int id) =>
      _client.mutate(Procedures.expense.delete, input: {'id': id});

  /// The newest transactions first: `expense.list`. [before] continues after the last id of the previous page;
  /// [startDate] and [endDate] are Cairo wall-clock dates ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.SSS").
  Future<LedgerPage> list({
    int limit = 30,
    int? before,
    String? category,
    String? type,
    String? startDate,
    String? endDate,
  }) async {
    final data = await _client.query(
      Procedures.expense.list,
      input: {
        'limit': limit,
        'cursor': ?before,
        'category': ?category,
        'type': ?type,
        'startDate': ?startDate,
        'endDate': ?endDate,
      },
    );
    return LedgerPage.fromJson(_object(data));
  }

  /// Searches transactions across category, subcategory, description and original sentence:
  /// `expense.searchTransactions` (`query` must be 2–100 characters).
  Future<List<LedgerEntry>> searchTransactions(String query) async {
    final trimmed = query.trim();
    if (trimmed.length < 2) return const [];
    final safe = trimmed.length > 100 ? trimmed.substring(0, 100) : trimmed;
    final data = await _client.query(
      Procedures.expense.searchTransactions,
      input: {'query': safe},
    );
    return [
      for (final item in data as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) LedgerEntry.fromJson(item),
    ];
  }

  /// The person's custom categories: `expense.getCategoryList`.
  Future<List<String>> customCategories() async {
    final data = await _client.query(Procedures.expense.getCategoryList);
    return [
      for (final item in data as List<Object?>? ?? const [])
        if (item is Map<String, Object?>)
          if (item['name'] case final String name when name.trim().isNotEmpty)
            name.trim(),
    ];
  }

  /// The people saved on this account: `profile.listContacts`.
  Future<List<ContactSummary>> contacts() async {
    final data = await _client.query(
      Procedures.profile.listContacts,
      input: const {'filter': 'all'},
    );
    final raw = _object(data)['contacts'];
    return [
      for (final item in raw as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) ContactSummary.fromJson(item),
    ];
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

  /// How many sentences the person's plan lets wait offline (`ai.getUserLimits`, `offline.limit`).
  Future<int?> offlineLimit() async {
    final data = await _client.query(Procedures.ai.getUserLimits);
    if (data is! Map<String, Object?>) return null;
    final offline = data['offline'];
    return offline is Map<String, Object?>
        ? (offline['limit'] as num?)?.toInt()
        : null;
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

/// The first and last Cairo calendar days ("YYYY-MM-DD") of [month] ("YYYY-MM"), counted from [salaryDay] when the
/// person's month starts on payday (`api/services/financial-month.ts#getFinancialMonthDayRange`).
({String startDay, String endDay}) financialMonthDayRange(
  String month, {
  int? salaryDay,
}) {
  final parts = month.split('-');
  final year = int.parse(parts[0]);
  final monthNum = int.parse(parts[1]);
  String two(int value) => value.toString().padLeft(2, '0');

  final daysInMonth = DateTime.utc(year, monthNum + 1, 0).day;
  if (salaryDay == null || salaryDay <= 1) {
    return (startDay: '$month-01', endDay: '$month-${two(daysInMonth)}');
  }
  final clampedStart = min(salaryDay, daysInMonth);
  final startDay = '$year-${two(monthNum)}-${two(clampedStart)}';

  final nextMonth = monthNum == 12 ? 1 : monthNum + 1;
  final nextYear = monthNum == 12 ? year + 1 : year;
  final daysInNextMonth = DateTime.utc(nextYear, nextMonth + 1, 0).day;
  final clampedNextSalary = min(salaryDay, daysInNextMonth);
  final endDay = '$nextYear-${two(nextMonth)}-${two(clampedNextSalary - 1)}';
  return (startDay: startDay, endDay: endDay);
}
