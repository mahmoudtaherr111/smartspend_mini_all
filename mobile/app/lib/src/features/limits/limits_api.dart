import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import 'limits_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class LimitsApi {
  const LimitsApi(this._client);

  final TrpcClient _client;

  Future<UserLimits> getUserLimits() async {
    final response = _object(
      await _client.query(Procedures.ai.getUserLimits),
    );
    return UserLimits.fromJson(response);
  }
}

final limitsApiProvider = Provider<LimitsApi>((ref) {
  final client = ref.watch(trpcClientProvider);
  return LimitsApi(client);
});

final userLimitsProvider = FutureProvider<UserLimits>((ref) async {
  final api = ref.watch(limitsApiProvider);
  return api.getUserLimits();
});
