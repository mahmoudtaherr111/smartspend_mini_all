import 'package:smartspend_api/smartspend_api.dart';
import 'budget_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class BudgetApi {
  const BudgetApi(this._client);

  final TrpcClient _client;

  Future<List<BudgetStatus>> listBudgets() async {
    final response = _object(await _client.query(Procedures.budget.list));
    final raw = response['budgets'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(BudgetStatus.fromJson)
        .toList();
  }

  Future<int> createBudget({
    required String title,
    String? category,
    required double monthlyLimit,
    int periodStartDay = 1,
    int? linkedGoalId,
    int alertThresholdPercent = 80,
  }) async {
    final args = <String, Object?>{
      'title': title.trim(),
      if (category != null && category.trim().isNotEmpty)
        'category': category.trim(),
      'monthlyLimit': monthlyLimit,
      'periodStartDay': periodStartDay,
      'linkedGoalId': ?linkedGoalId,
      'alertThresholdPercent': alertThresholdPercent,
    };
    final response =
        _object(await _client.mutate(Procedures.budget.create, input: args));
    return (response['budgetId'] as num?)?.toInt() ?? 0;
  }

  Future<bool> updateBudget({
    required int budgetId,
    String? title,
    String? category,
    double? monthlyLimit,
    int? periodStartDay,
    int? linkedGoalId,
    int? alertThresholdPercent,
    String? status,
  }) async {
    final args = <String, Object?>{'budgetId': budgetId};
    if (title != null) args['title'] = title.trim();
    if (category != null) {
      args['category'] = category.trim().isEmpty ? '' : category.trim();
    }
    if (monthlyLimit != null) args['monthlyLimit'] = monthlyLimit;
    if (periodStartDay != null) args['periodStartDay'] = periodStartDay;
    if (linkedGoalId != null) args['linkedGoalId'] = linkedGoalId;
    if (alertThresholdPercent != null) {
      args['alertThresholdPercent'] = alertThresholdPercent;
    }
    if (status != null) args['status'] = status;

    final response =
        _object(await _client.mutate(Procedures.budget.update, input: args));
    return response['success'] == true;
  }

  Future<bool> deleteBudget(int budgetId) async {
    final response = _object(await _client.mutate(
      Procedures.budget.delete,
      input: {'budgetId': budgetId},
    ));
    return response['success'] == true;
  }
}
