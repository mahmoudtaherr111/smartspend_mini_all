import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import 'season_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class SeasonsApi {
  const SeasonsApi(this._client);

  final TrpcClient _client;

  Future<SeasonSpending> getSeasonSpending(String season, {int? year}) async {
    final args = <String, Object?>{'season': season, 'year': ?year};
    final response = _object(
      await _client.query(Procedures.expense.getSeasonSpending, input: args),
    );
    return SeasonSpending.fromJson(response);
  }
}

final seasonsApiProvider = Provider<SeasonsApi>((ref) {
  final client = ref.watch(trpcClientProvider);
  return SeasonsApi(client);
});

final seasonSpendingFamily = FutureProvider.family<SeasonSpending, String>((
  ref,
  season,
) async {
  final api = ref.watch(seasonsApiProvider);
  return api.getSeasonSpending(season);
});
