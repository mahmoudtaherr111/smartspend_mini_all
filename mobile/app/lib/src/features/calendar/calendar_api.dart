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

  /// Adds a commitment or expected income (`coach.addCashflow`). [amount] and [startDay] are sent even when null:
  /// the server takes null as "not known" and refuses a request without them. [startDay] is the first (or only)
  /// due date as a Cairo day key ("2026-11-01"); for a monthly one its day is the day of every month.
  Future<void> addCashflow({
    required String title,
    required String kind,
    required String direction,
    required num? amount,
    required String? startDay,
    String recurrence = 'monthly',
    int? contactId,
  }) async {
    await _client.mutate(
      Procedures.coach.addCashflow,
      input: {
        'title': title,
        'kind': kind,
        'direction': direction,
        'amount': amount,
        'startDay': startDay,
        'recurrence': recurrence,
        'contactId': ?contactId,
      },
    );
  }

  /// Changes a commitment (`coach.updateCashflow`); [status] 'ended' stops it, keeping what was paid.
  Future<void> updateCashflow({
    required int id,
    String? title,
    String? kind,
    num? amount,
    String? startDay,
    String? recurrence,
    String? status,
  }) async {
    await _client.mutate(
      Procedures.coach.updateCashflow,
      input: {
        'id': id,
        'title': ?title,
        'kind': ?kind,
        'amount': ?amount,
        'startDay': ?startDay,
        'recurrence': ?recurrence,
        'status': ?status,
      },
    );
  }

  /// Records that a due date was paid (`coach.settle`): by a recorded payment ([expenseId]), or, without one, as
  /// paid off the records. [amount] null lets the server take what is owed (or what is left of the payment).
  Future<void> settle({
    required int cashflowId,
    required String dueDay,
    int? expenseId,
    num? amount,
  }) async {
    await _client.mutate(
      Procedures.coach.settle,
      input: {
        'cashflowId': cashflowId,
        'dueDay': dueDay,
        'expenseId': ?expenseId,
        'amount': ?amount,
      },
    );
  }

  Future<void> unsettle(int settlementId) async {
    await _client.mutate(
      Procedures.coach.unsettle,
      input: {'settlementId': settlementId},
    );
  }

  /// Recorded payments that may have paid this due date, for the user to pick; nothing is linked here.
  Future<List<PaymentSuggestionItem>> getPaymentSuggestions({
    required int cashflowId,
    required String dueDay,
  }) async {
    final data = await _client.query(
      Procedures.coach.paymentSuggestions,
      input: {'cashflowId': cashflowId, 'dueDay': dueDay},
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

  /// [at] is the day and hour on Cairo's clock, "2026-11-07T09:00", whatever the phone's time zone.
  Future<void> setReminder({required int stepId, required String at}) async {
    await _client.mutate(
      Procedures.coach.setReminder,
      input: {'stepId': stepId, 'at': at},
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
