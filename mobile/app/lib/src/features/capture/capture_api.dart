import 'package:smartspend_api/smartspend_api.dart';

/// Whether capture is open on the server, what the person agreed to, and the consent text version to agree to
/// (`capture.status`).
final class CaptureServerStatus {
  const CaptureServerStatus({
    required this.enabled,
    required this.consented,
    required this.consentTextVersion,
  });

  final bool enabled;
  final bool consented;
  final String consentTextVersion;
}

/// A captured transaction waiting for the person's answer (`capture.pending`).
final class PendingCapture {
  const PendingCapture({
    required this.signalId,
    required this.kind,
    required this.amount,
    required this.currency,
    required this.amountEgp,
    required this.party,
    required this.source,
    required this.category,
    required this.subCategory,
    required this.certain,
  });

  final int signalId;

  /// The reader's kind ("card_purchase", "atm_withdrawal"…).
  final String kind;
  final double amount;
  final String currency;

  /// The amount in pounds, or null when the message gave only a foreign one: the person types it.
  final double? amountEgp;

  /// The merchant or person, as the message wrote it.
  final String? party;

  /// The bank or wallet, in Arabic as the catalog names it.
  final String? source;

  /// Where it would be filed, in the taxonomy's own words (never translated, decision 0020).
  final String category;
  final String subCategory;

  /// The reader was sure of the amount and the kind.
  final bool certain;

  static PendingCapture? fromJson(Object? data) {
    if (data is! Map<String, Object?>) return null;
    final reading = data['reading'];
    final suggestion = data['suggestion'];
    final id = data['signalId'];
    if (reading is! Map<String, Object?> ||
        suggestion is! Map<String, Object?> ||
        id is! int) {
      return null;
    }
    final money = reading['amount'];
    if (money is! Map<String, Object?> || money['value'] is! num) return null;
    final party = reading['counterparty'];
    final source = reading['sourceName'];
    return PendingCapture(
      signalId: id,
      kind: reading['kind'] as String? ?? 'other',
      amount: (money['value'] as num).toDouble(),
      currency: money['currency'] as String? ?? 'EGP',
      amountEgp: (suggestion['amountEgp'] as num?)?.toDouble(),
      party: party is Map<String, Object?>
          ? (party['name'] as String? ??
                (party['phoneTail'] is String
                    ? '••${party['phoneTail']}'
                    : null))
          : null,
      source: source is Map<String, Object?> ? source['ar'] as String? : null,
      category: suggestion['category'] as String? ?? '',
      subCategory: suggestion['subCategory'] as String? ?? '',
      certain: reading['confidence'] == 'certain',
    );
  }
}

/// The capture procedures the app calls (`api/capture-router.ts`, decision 0028).
class CaptureApi {
  CaptureApi(this._client);

  final TrpcClient _client;

  Future<CaptureServerStatus> status() async {
    final data = await _client.query(Procedures.capture.status);
    final map = data is Map<String, Object?> ? data : const <String, Object?>{};
    final consent = map['consent'];
    return CaptureServerStatus(
      enabled: map['enabled'] == true,
      consented: consent is Map<String, Object?> && consent['capture'] == true,
      consentTextVersion: map['consentTextVersion'] as String? ?? '',
    );
  }

  /// Records the person's consent to read their bank notifications, for [textVersion] of the text they read.
  Future<void> consent(String textVersion) => _client.mutate(
    Procedures.capture.setConsent,
    input: {'scope': 'capture', 'granted': true, 'textVersion': textVersion},
  );

  /// The device token for this installation; the server shows it once.
  Future<String> registerDevice({
    required String installationId,
    required String platform,
    String? appVersion,
  }) async {
    final data = await _client.mutate(
      Procedures.capture.registerDevice,
      input: {
        'platform': platform,
        'installationId': installationId,
        'appVersion': ?appVersion,
      },
    );
    final token = data is Map<String, Object?> ? data['token'] : null;
    if (token is! String || token.isEmpty) {
      throw const FormatException('registerDevice answered without a token');
    }
    return token;
  }

  Future<List<PendingCapture>> pending() async {
    final data = await _client.query(Procedures.capture.pending);
    return [
      for (final item in data is List<Object?> ? data : const <Object?>[])
        ?PendingCapture.fromJson(item),
    ];
  }

  /// Records the transaction (with [amountEgp] when only a foreign amount was known) or dismisses it.
  Future<void> answer(
    int signalId, {
    required bool record,
    double? amountEgp,
  }) => _client.mutate(
    Procedures.capture.answer,
    input: {
      'signalId': signalId,
      'action': record ? 'record' : 'dismiss',
      'amountEgp': ?amountEgp,
    },
  );
}
