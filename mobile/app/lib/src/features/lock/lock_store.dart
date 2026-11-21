import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The app lock on this phone, as it is kept between launches.
///
/// No PIN or secret is ever kept: only a random salt and the PIN's tag (an HMAC made with a key that stays in the
/// Keystore or Keychain), and the hash of the secret the biometric key guards. The count of wrong PINs is kept here
/// too, so closing the app does not reset it.
final class LockRecord {
  const LockRecord({
    this.accountKey,
    this.pinSalt,
    this.pinTag,
    this.biometricCheck,
    this.biometricSealed,
    this.relockAfter = defaultRelockAfter,
    this.hideAmounts = false,
    this.failures = 0,
    this.lastFailureAt,
    this.damaged = false,
  });

  /// How long the app may stay in the background before it asks again, unless the person chose otherwise.
  static const defaultRelockAfter = Duration(minutes: 1);

  /// The account the lock belongs to (`phone:42`, `google:7`).
  final String? accountKey;
  final Uint8List? pinSalt;
  final Uint8List? pinTag;

  /// SHA-256 of the secret the biometric key gives back.
  final Uint8List? biometricCheck;

  /// Android: the secret sealed by the biometric key. iOS keeps it in the Keychain.
  final Uint8List? biometricSealed;
  final Duration relockAfter;
  final bool hideAmounts;

  /// Wrong PINs in a row.
  final int failures;
  final DateTime? lastFailureAt;

  /// The stored record could not be read. The lock then stays shut and offers only signing out, since the PIN can
  /// no longer be checked.
  final bool damaged;

  bool get enabled => pinTag != null || damaged;
  bool get biometrics => biometricCheck != null;

  LockRecord copyWith({
    String? accountKey,
    Duration? relockAfter,
    bool? hideAmounts,
    int? failures,
    DateTime? lastFailureAt,
  }) => LockRecord(
    accountKey: accountKey ?? this.accountKey,
    pinSalt: pinSalt,
    pinTag: pinTag,
    biometricCheck: biometricCheck,
    biometricSealed: biometricSealed,
    relockAfter: relockAfter ?? this.relockAfter,
    hideAmounts: hideAmounts ?? this.hideAmounts,
    failures: failures ?? this.failures,
    lastFailureAt: lastFailureAt ?? this.lastFailureAt,
  );

  /// A new PIN: earlier failures are forgotten.
  LockRecord withPin(Uint8List salt, Uint8List tag) => LockRecord(
    accountKey: accountKey,
    pinSalt: salt,
    pinTag: tag,
    biometricCheck: biometricCheck,
    biometricSealed: biometricSealed,
    relockAfter: relockAfter,
    hideAmounts: hideAmounts,
  );

  LockRecord withBiometrics(Uint8List? check, Uint8List? sealed) => LockRecord(
    accountKey: accountKey,
    pinSalt: pinSalt,
    pinTag: pinTag,
    biometricCheck: check,
    biometricSealed: sealed,
    relockAfter: relockAfter,
    hideAmounts: hideAmounts,
    failures: failures,
    lastFailureAt: lastFailureAt,
  );

  /// The lock turned off: the account and the choice to hide amounts stay.
  LockRecord withoutLock() => LockRecord(
    accountKey: accountKey,
    relockAfter: relockAfter,
    hideAmounts: hideAmounts,
  );

  LockRecord withoutFailures() => LockRecord(
    accountKey: accountKey,
    pinSalt: pinSalt,
    pinTag: pinTag,
    biometricCheck: biometricCheck,
    biometricSealed: biometricSealed,
    relockAfter: relockAfter,
    hideAmounts: hideAmounts,
  );

  Map<String, Object?> toJson() => {
    'version': 1,
    'accountKey': accountKey,
    'pinSalt': _encode(pinSalt),
    'pinTag': _encode(pinTag),
    'biometricCheck': _encode(biometricCheck),
    'biometricSealed': _encode(biometricSealed),
    'relockAfterSeconds': relockAfter.inSeconds,
    'hideAmounts': hideAmounts,
    'failures': failures,
    'lastFailureAt': lastFailureAt?.toUtc().toIso8601String(),
  };

  static LockRecord fromJson(Map<String, Object?> json) => LockRecord(
    accountKey: json['accountKey'] as String?,
    pinSalt: _decode(json['pinSalt']),
    pinTag: _decode(json['pinTag']),
    biometricCheck: _decode(json['biometricCheck']),
    biometricSealed: _decode(json['biometricSealed']),
    relockAfter: Duration(
      seconds:
          (json['relockAfterSeconds'] as num?)?.toInt() ??
          defaultRelockAfter.inSeconds,
    ),
    hideAmounts: json['hideAmounts'] == true,
    failures: (json['failures'] as num?)?.toInt() ?? 0,
    lastFailureAt: switch (json['lastFailureAt']) {
      final String at => DateTime.parse(at),
      _ => null,
    },
  );

  static String? _encode(Uint8List? bytes) =>
      bytes == null ? null : base64Encode(bytes);

  static Uint8List? _decode(Object? value) =>
      value is String ? base64Decode(value) : null;
}

/// Where the [LockRecord] is kept.
abstract interface class LockStore {
  Future<LockRecord> read();
  Future<void> write(LockRecord record);
  Future<void> clear();
}

/// In the Keychain (this device only, not in backups) or Keystore-backed storage, next to the session token.
class SecureLockStore implements LockStore {
  SecureLockStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _key = 'smartspend.lock';

  final FlutterSecureStorage _storage;

  @override
  Future<LockRecord> read() async {
    final String? raw;
    try {
      raw = await _storage.read(key: _key);
    } on Object {
      return const LockRecord(damaged: true);
    }
    if (raw == null) return const LockRecord();
    try {
      return LockRecord.fromJson(jsonDecode(raw) as Map<String, Object?>);
    } on Object {
      return const LockRecord(damaged: true);
    }
  }

  @override
  Future<void> write(LockRecord record) =>
      _storage.write(key: _key, value: jsonEncode(record.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// For tests: the record in memory, written through JSON as the real store does.
class MemoryLockStore implements LockStore {
  MemoryLockStore([this.record = const LockRecord()]);

  LockRecord record;

  @override
  Future<LockRecord> read() async => record.damaged
      ? record
      : LockRecord.fromJson(
          jsonDecode(jsonEncode(record.toJson())) as Map<String, Object?>,
        );

  @override
  Future<void> write(LockRecord record) async => this.record = record;

  @override
  Future<void> clear() async => record = const LockRecord();
}
