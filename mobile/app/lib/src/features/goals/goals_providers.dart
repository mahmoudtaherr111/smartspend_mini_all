import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'goal_models.dart';
import 'goals_api.dart';

final goalsApiProvider = Provider<GoalsApi>((ref) {
  final client = ref.watch(trpcClientProvider);
  return GoalsApi(client);
});

class GoalsNotifier extends AsyncNotifier<GoalsListResponse> {
  @override
  Future<GoalsListResponse> build() async {
    final api = ref.watch(goalsApiProvider);
    return api.listGoals();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(goalsApiProvider);
      return api.listGoals();
    });
  }

  Future<int> createGoal({
    required String title,
    String? description,
    required double targetAmount,
    DateTime? targetDate,
  }) async {
    final api = ref.read(goalsApiProvider);
    final id = await api.createGoal(
      title: title,
      description: description,
      targetAmount: targetAmount,
      targetDate: targetDate,
    );
    unawaited(refresh());
    return id;
  }

  Future<bool> setStatus({
    required int goalId,
    required String status,
  }) async {
    final api = ref.read(goalsApiProvider);
    final ok = await api.setStatus(goalId: goalId, status: status);
    unawaited(refresh());
    return ok;
  }

  Future<bool> deleteGoal(int goalId) async {
    final api = ref.read(goalsApiProvider);
    final ok = await api.deleteGoal(goalId);
    unawaited(refresh());
    return ok;
  }

  Future<GoalAnalysis> analyzeGoal(int goalId) async {
    final api = ref.read(goalsApiProvider);
    final analysis = await api.analyzeGoal(goalId);
    unawaited(refresh());
    return analysis;
  }
}

final goalsProvider =
    AsyncNotifierProvider<GoalsNotifier, GoalsListResponse>(
  GoalsNotifier.new,
);
