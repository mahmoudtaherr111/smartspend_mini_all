import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'installment_models.dart';
import 'installments_api.dart';

final installmentsApiProvider = Provider<InstallmentsApi>((ref) {
  final client = ref.watch(trpcClientProvider);
  return InstallmentsApi(client);
});

class InstallmentsNotifier extends AsyncNotifier<List<InstallmentPlan>> {
  @override
  Future<List<InstallmentPlan>> build() async {
    final api = ref.watch(installmentsApiProvider);
    return api.listInstallmentPlans();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(installmentsApiProvider);
      return api.listInstallmentPlans();
    });
  }

  Future<bool> createPlan(CreateInstallmentInput input) async {
    final api = ref.read(installmentsApiProvider);
    final ok = await api.createInstallmentPlan(input);
    if (ok) {
      unawaited(refresh());
    }
    return ok;
  }

  Future<bool> deletePlan(int id) async {
    final previous = state.value ?? [];
    // Optimistically remove
    state = AsyncData(previous.where((p) => p.id != id).toList());
    try {
      final api = ref.read(installmentsApiProvider);
      final ok = await api.deleteInstallmentPlan(id);
      if (!ok) {
        state = AsyncData(previous);
        return false;
      }
      return true;
    } catch (e) {
      state = AsyncData(previous);
      return false;
    }
  }
}

final installmentsProvider =
    AsyncNotifierProvider<InstallmentsNotifier, List<InstallmentPlan>>(
      InstallmentsNotifier.new,
    );
