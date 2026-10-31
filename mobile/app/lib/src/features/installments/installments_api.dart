import 'package:smartspend_api/smartspend_api.dart';

import 'installment_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class InstallmentsApi {
  const InstallmentsApi(this._client);

  final TrpcClient _client;

  Future<List<InstallmentPlan>> listInstallmentPlans() async {
    final response = await _client.query(
      Procedures.expense.listInstallmentPlans,
    );
    if (response is! List) return const [];
    return response
        .whereType<Map<String, Object?>>()
        .map(InstallmentPlan.fromJson)
        .toList();
  }

  Future<bool> createInstallmentPlan(CreateInstallmentInput input) async {
    final response = _object(
      await _client.mutate(
        Procedures.expense.createInstallmentPlan,
        input: input.toJson(),
      ),
    );
    return response['success'] == true;
  }

  Future<bool> deleteInstallmentPlan(int id) async {
    final response = _object(
      await _client.mutate(
        Procedures.expense.deleteInstallmentPlan,
        input: {'id': id},
      ),
    );
    return response['success'] == true;
  }
}
