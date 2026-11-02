import 'package:smartspend_api/smartspend_api.dart';

import '../ledger/ledger_models.dart';
import 'calendar_models.dart';

final class CalendarApi {
  const CalendarApi(this._client);

  final TrpcClient _client;

  Future<CoachOverviewData> getOverview() async {
    final data = await _client.query(Procedures.coach.overview);
    if (data is! Map<String, Object?>) {
      throw ApiException(
        code: 'MALFORMED_RESPONSE',
        httpStatus: 200,
        message: friendlyHttpMessage(500),
        path: Procedures.coach.overview.path,
      );
    }
    return CoachOverviewData.fromJson(data);
  }

  Future<void> addCashflow({
    required String title,
    required String kind,
    required String direction,
    num? amount,
    int? dueDay,
    String? dueDate,
    String recurrence = 'monthly',
    int? contactId,
  }) async {
    await _client.mutate(
      Procedures.coach.addCashflow,
      input: {
        'title': title,
        'kind': kind,
        'direction': direction,
        'amount': ?amount,
        'dueDay': ?dueDay,
        'dueDate': ?dueDate,
        'recurrence': recurrence,
        'contactId': ?contactId,
      },
    );
  }

  Future<void> updateCashflow({
    required int cashflowId,
    String? title,
    String? kind,
    num? amount,
    int? dueDay,
    String? dueDate,
    String? recurrence,
    String? status,
    bool? isArchived,
  }) async {
    await _client.mutate(
      Procedures.coach.updateCashflow,
      input: {
        'cashflowId': cashflowId,
        'title': ?title,
        'kind': ?kind,
        'amount': ?amount,
        'dueDay': ?dueDay,
        'dueDate': ?dueDate,
        'recurrence': ?recurrence,
        'status': ?status,
        'isArchived': ?isArchived,
      },
    );
  }

  Future<void> settle({
    required int cashflowId,
    int? expenseId,
    num? amount,
    String? note,
  }) async {
    await _client.mutate(
      Procedures.coach.settle,
      input: {
        'cashflowId': cashflowId,
        'expenseId': ?expenseId,
        'amount': ?amount,
        'note': ?note,
      },
    );
  }

  Future<void> unsettle(int settlementId) async {
    await _client.mutate(
      Procedures.coach.unsettle,
      input: {'settlementId': settlementId},
    );
  }

  Future<List<PaymentSuggestionItem>> getPaymentSuggestions(
    int cashflowId,
  ) async {
    final data = await _client.query(
      Procedures.coach.paymentSuggestions,
      input: {'cashflowId': cashflowId},
    );
    if (data is! List<Object?>) return const [];
    return [
      for (final raw in data)
        if (raw is Map<String, Object?>) PaymentSuggestionItem.fromJson(raw),
    ];
  }

  Future<void> setStepStatus({
    required int stepId,
    required String status,
  }) async {
    await _client.mutate(
      Procedures.coach.setStepStatus,
      input: {'stepId': stepId, 'status': status},
    );
  }

  Future<void> setReminder({
    required int stepId,
    required String scheduledAt,
  }) async {
    await _client.mutate(
      Procedures.coach.setReminder,
      input: {'stepId': stepId, 'remindAt': scheduledAt},
    );
  }

  Future<void> cancelReminder(int stepId) async {
    await _client.mutate(
      Procedures.coach.cancelReminder,
      input: {'stepId': stepId},
    );
  }

  Future<void> endPlan(int planId, {String status = 'completed'}) async {
    await _client.mutate(
      Procedures.coach.endPlan,
      input: {'planId': planId, 'status': status},
    );
  }

  Future<List<LedgerEntry>> getDayTransactions(String dateStr) async {
    final data = await _client.query(
      Procedures.expense.list,
      input: {
        'startDate': '${dateStr}T00:00:00.000',
        'endDate': '${dateStr}T23:59:59.999',
        'limit': 100,
      },
    );
    if (data is! Map<String, Object?>) return const [];
    final items = data['items'] as List<Object?>? ?? const [];
    return [
      for (final raw in items)
        if (raw is Map<String, Object?>) LedgerEntry.fromJson(raw),
    ];
  }
}
