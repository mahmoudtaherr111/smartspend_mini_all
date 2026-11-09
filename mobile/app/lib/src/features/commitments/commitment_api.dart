import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import 'commitment_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

/// The `commitments.*` procedures (api/commitments-router.ts), sent exactly as their schemas take them.
final class CommitmentApi {
  const CommitmentApi(this._client);

  final TrpcClient _client;

  Future<CommitmentsOverview> overview() async => CommitmentsOverview.fromJson(
    _object(await _client.query(Procedures.commitments.overview)),
  );

  Future<CommitmentDetail> detail(int id) async => CommitmentDetail.fromJson(
    _object(
      await _client.query(Procedures.commitments.detail, input: {'id': id}),
    ),
  );

  /// The dates of [month] ("2026-11") for the calendar.
  Future<List<DueDate>> month(String month) async {
    final data = await _client.query(
      Procedures.commitments.month,
      input: {'month': month},
    );
    return [
      for (final raw in data is List ? data : const [])
        if (raw is Map<String, Object?>) DueDate.fromJson(raw),
    ];
  }

  Future<List<CatalogBrand>> subscriptions() async {
    final data = await _client.query(Procedures.commitments.subscriptions);
    return [
      for (final raw in data is List ? data : const [])
        if (raw is Map<String, Object?>) CatalogBrand.fromJson(raw),
    ];
  }

  /// The admin's default reminder: how many days before and at what hour.
  Future<({int days, int hour})> defaults() async {
    final data = _object(await _client.query(Procedures.commitments.defaults));
    return (
      days: (data['remindDaysBefore'] as num?)?.toInt() ?? 3,
      hour: (data['remindHour'] as num?)?.toInt() ?? 10,
    );
  }

  /// Creates a commitment from its shape's fixed fields; returns its id.
  Future<int> create(Map<String, Object?> fields) async {
    final data = _object(
      await _client.mutate(Procedures.commitments.create, input: fields),
    );
    return (data['id'] as num?)?.toInt() ?? 0;
  }

  Future<void> update(int id, Map<String, Object?> patch) async {
    await _client.mutate(
      Procedures.commitments.update,
      input: {'id': id, ...patch},
    );
  }

  /// 'active' | 'paused' | 'ended'.
  Future<void> setStatus(int id, String status) async {
    await _client.mutate(
      Procedures.commitments.setStatus,
      input: {'id': id, 'status': status},
    );
  }

  /// One date: 'skip', 'move' to [newDay], 'amount' this time; null [action] clears the change.
  Future<void> setOverride(
    int id,
    String dueDay,
    String? action, {
    String? newDay,
    num? amount,
  }) async {
    await _client.mutate(
      Procedures.commitments.setOverride,
      input: {
        'id': id,
        'dueDay': dueDay,
        'action': action,
        'newDay': ?newDay,
        'amount': ?amount,
      },
    );
  }

  /// "دفعته": records the payment and links it; [record] false says it was paid off the records.
  Future<({int? expenseId, int settlementId})> pay(
    int cashflowId,
    String dueDay, {
    num? amount,
    bool record = true,
    String? date,
    String? clientRequestId,
  }) async {
    final data = _object(
      await _client.mutate(
        Procedures.commitments.pay,
        input: {
          'cashflowId': cashflowId,
          'dueDay': dueDay,
          'amount': ?amount,
          'record': record,
          'date': ?date,
          'clientRequestId': ?clientRequestId,
        },
      ),
    );
    return (
      expenseId: (data['expenseId'] as num?)?.toInt(),
      settlementId: (data['settlementId'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> unlink(int settlementId) async {
    await _client.mutate(
      Procedures.commitments.unlink,
      input: {'settlementId': settlementId},
    );
  }

  Future<CommitmentQuestions> questions() async => CommitmentQuestions.fromJson(
    _object(await _client.query(Procedures.commitments.questions)),
  );

  /// Answers a question: a due check ('paid', 'paid_off_records', 'not_yet') or a link (a candidate, or 'none').
  Future<void> answer(String key, String answer) async {
    await _client.mutate(
      Procedures.commitments.answer,
      input: {'key': key, 'answer': answer},
    );
  }

  Future<List<CommitmentLink>> linksFor(List<int> expenseIds) async {
    final data = await _client.query(
      Procedures.commitments.linksFor,
      input: {'expenseIds': expenseIds},
    );
    return [
      for (final raw in data is List ? data : const [])
        if (raw is Map<String, Object?>) CommitmentLink.fromJson(raw),
    ];
  }

  Future<SentenceCommitment?> forSentence(String text) async {
    final data = await _client.query(
      Procedures.commitments.forSentence,
      input: {'text': text},
    );
    return data is Map<String, Object?>
        ? SentenceCommitment.fromJson(data)
        : null;
  }
}

final commitmentApiProvider = Provider<CommitmentApi>(
  (ref) => CommitmentApi(ref.watch(trpcClientProvider)),
);

final commitmentsOverviewProvider = FutureProvider<CommitmentsOverview>((ref) {
  if (ref.watch(sessionProvider) is! SignedIn) {
    return const CommitmentsOverview(today: '');
  }
  return ref.watch(commitmentApiProvider).overview();
});

final commitmentDetailProvider = FutureProvider.family<CommitmentDetail, int>(
  (ref, id) => ref.watch(commitmentApiProvider).detail(id),
);

/// The commitments' dates in a calendar month; empty when they cannot be read, so the calendar still draws.
final commitmentsMonthProvider = FutureProvider.family<List<DueDate>, String>((
  ref,
  month,
) async {
  if (ref.watch(sessionProvider) is! SignedIn) return const [];
  try {
    return await ref.watch(commitmentApiProvider).month(month);
  } on Object {
    return const [];
  }
});

final subscriptionChoicesProvider = FutureProvider<List<CatalogBrand>>(
  (ref) => ref.watch(commitmentApiProvider).subscriptions(),
);

/// Forgets what the screens hold about commitments after a change.
void refreshCommitments(WidgetRef ref) {
  ref.invalidate(commitmentsOverviewProvider);
  ref.invalidate(commitmentDetailProvider);
  ref.invalidate(commitmentsMonthProvider);
}
