import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import 'business_api.dart';
import 'business_models.dart';

final businessApiProvider = Provider<BusinessApi>(
  (ref) => BusinessApi(ref.watch(trpcClientProvider)),
);

/// The current user's business state and categories (BIZ-01).
final businessDashboardProvider = FutureProvider<BusinessState>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session is! SignedIn) {
    return const BusinessState();
  }
  return ref.watch(businessApiProvider).get();
});

/// Available preset business types (BIZ-01).
final businessTypesProvider = FutureProvider<List<BusinessTypeOption>>((ref) async {
  return ref.watch(businessApiProvider).types();
});

/// Whether the user is currently working in business scope (BIZ-03).
class BusinessModeActiveNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool value) => state = value;
  void toggle() => state = !state;
}

final isBusinessModeActiveProvider =
    NotifierProvider<BusinessModeActiveNotifier, bool>(
  BusinessModeActiveNotifier.new,
);
