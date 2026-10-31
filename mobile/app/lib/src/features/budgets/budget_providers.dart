import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'budget_api.dart';
import 'budget_models.dart';

final budgetApiProvider = Provider<BudgetApi>((ref) {
  final client = ref.watch(trpcClientProvider);
  return BudgetApi(client);
});

class BudgetsNotifier extends AsyncNotifier<List<BudgetStatus>> {
  @override
  Future<List<BudgetStatus>> build() async {
    final api = ref.watch(budgetApiProvider);
    return api.listBudgets();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(budgetApiProvider);
      return api.listBudgets();
    });
  }

  Future<int> createBudget({
    required String title,
    String? category,
    required double monthlyLimit,
    int periodStartDay = 1,
    int? linkedGoalId,
    int alertThresholdPercent = 80,
  }) async {
    final api = ref.read(budgetApiProvider);
    final id = await api.createBudget(
      title: title,
      category: category,
      monthlyLimit: monthlyLimit,
      periodStartDay: periodStartDay,
      linkedGoalId: linkedGoalId,
      alertThresholdPercent: alertThresholdPercent,
    );
    unawaited(refresh());
    return id;
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
    final api = ref.read(budgetApiProvider);
    final ok = await api.updateBudget(
      budgetId: budgetId,
      title: title,
      category: category,
      monthlyLimit: monthlyLimit,
      periodStartDay: periodStartDay,
      linkedGoalId: linkedGoalId,
      alertThresholdPercent: alertThresholdPercent,
      status: status,
    );
    unawaited(refresh());
    return ok;
  }

  Future<bool> deleteBudget(int budgetId) async {
    final api = ref.read(budgetApiProvider);
    final ok = await api.deleteBudget(budgetId);
    unawaited(refresh());
    return ok;
  }

  Future<void> restoreBudget(BudgetStatus budget) async {
    final api = ref.read(budgetApiProvider);
    await api.createBudget(
      title: budget.title,
      category: budget.category,
      monthlyLimit: budget.monthlyLimit,
      periodStartDay: budget.periodStartDay,
      linkedGoalId: budget.linkedGoalId,
      alertThresholdPercent: budget.alertThresholdPercent,
    );
    unawaited(refresh());
  }
}

final budgetsProvider =
    AsyncNotifierProvider<BudgetsNotifier, List<BudgetStatus>>(
  BudgetsNotifier.new,
);
