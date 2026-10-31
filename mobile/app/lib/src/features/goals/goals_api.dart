import 'package:smartspend_api/smartspend_api.dart';
import 'goal_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class GoalsApi {
  const GoalsApi(this._client);

  final TrpcClient _client;

  Future<GoalsListResponse> listGoals() async {
    final response = _object(await _client.query(Procedures.goals.list));
    final rawGoals = response['goals'];
    final isPro = response['isPro'] as bool? ?? false;

    final goals = (rawGoals is List)
        ? rawGoals
            .whereType<Map<String, dynamic>>()
            .map(Goal.fromJson)
            .toList()
        : <Goal>[];

    return GoalsListResponse(goals: goals, isPro: isPro);
  }

  Future<int> createGoal({
    required String title,
    String? description,
    required double targetAmount,
    DateTime? targetDate,
  }) async {
    final args = <String, Object?>{
      'title': title.trim(),
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      'targetAmount': targetAmount,
      if (targetDate != null) 'targetDate': targetDate.toIso8601String(),
    };

    final response =
        _object(await _client.mutate(Procedures.goals.create, input: args));
    return (response['id'] as num?)?.toInt() ?? 0;
  }

  Future<bool> setStatus({
    required int goalId,
    required String status,
  }) async {
    final response = _object(await _client.mutate(
      Procedures.goals.setStatus,
      input: {'goalId': goalId, 'status': status},
    ));
    return response['success'] == true;
  }

  Future<bool> deleteGoal(int goalId) async {
    final response = _object(await _client.mutate(
      Procedures.goals.delete,
      input: {'goalId': goalId},
    ));
    return response['success'] == true;
  }

  Future<GoalAnalysis> analyzeGoal(int goalId) async {
    final response = _object(await _client.mutate(
      Procedures.goals.analyze,
      input: {'goalId': goalId},
    ));
    final rawAnalysis = response['analysis'];
    if (rawAnalysis is Map<String, dynamic>) {
      return GoalAnalysis.fromJson(rawAnalysis);
    }
    return const GoalAnalysis();
  }
}
