import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import 'plan_models.dart';

/// The user's active plan, subscription, and feature gates: `pro.myPlan`.
final userPlanProvider = FutureProvider<UserPlanInfo>((ref) async {
  final client = ref.watch(trpcClientProvider);
  try {
    final data = await client.query(Procedures.pro.myPlan);
    if (data is Map<String, Object?>) {
      return UserPlanInfo.fromJson(data);
    }
  } catch (_) {
    // Graceful fallback to free defaults on network/offline failure
  }
  return const UserPlanInfo(plan: 'free', role: 'user');
});

/// Whether the signed-in person has Pro entitlements (Pro subscriber or Admin).
final isProUserProvider = Provider<bool>((ref) {
  return ref.watch(userPlanProvider).asData?.value.isPro ?? false;
});

/// Plan catalog describing limits and features: `pro.planCatalog`.
final planCatalogProvider = FutureProvider<Map<String, List<PlanCatalogItem>>>((
  ref,
) async {
  final client = ref.watch(trpcClientProvider);
  try {
    final data = await client.query(Procedures.pro.planCatalog);
    if (data is Map<String, Object?>) {
      final map = <String, List<PlanCatalogItem>>{};
      for (final entry in data.entries) {
        if (entry.value is List) {
          map[entry.key] = [
            for (final row in entry.value as List<Object?>)
              if (row is Map<String, Object?>) PlanCatalogItem.fromJson(row),
          ];
        }
      }
      return map;
    }
  } catch (_) {
    // Fallback empty catalog
  }
  return const {};
});
