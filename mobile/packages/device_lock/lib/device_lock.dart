/// The phone's side of the app lock: what biometrics the phone has, biometrics bound to a key in the Keystore or
/// Keychain, the key that tags the PIN, and the cover in the app switcher. The rules of the lock (when it locks,
/// how many tries) live in the app; see docs/decisions/0023-mobile-app-lock.md.
library;

import 'dart:typed_data';

import 'src/device_lock_api.g.dart';

export 'src/device_lock_api.g.dart'
    show
        BiometricAvailability,
        BiometricKind,
        BiometricOutcome,
        BiometricPromptText,
        BiometricResult,
        LockCapabilities;

/// The native calls the app lock makes. The app talks to this interface, so its tests answer it in Dart.
abstract interface class DeviceLock {
  factory DeviceLock() = _PigeonDeviceLock;

  Future<LockCapabilities> capabilities();

  /// Makes a key only today's biometrics open, asks for them once, and returns the secret it guards.
  Future<BiometricResult> enrollBiometrics(BiometricPromptText text);

  /// Asks for the biometrics and returns the secret; [sealed] is what [enrollBiometrics] returned.
  Future<BiometricResult> unlockWithBiometrics(
    BiometricPromptText text,
    Uint8List? sealed,
  );

  Future<void> forgetBiometrics();

  /// HMAC-SHA256 of [input] with a key that stays on the phone. Throws a `PlatformException` with code
  /// `no-pin-key` when the key is gone and [create] is false.
  Future<Uint8List> pinTag(Uint8List input, {required bool create});

  Future<void> forgetPinKey();

  Future<void> setSwitcherCover(bool enabled);
}

class _PigeonDeviceLock implements DeviceLock {
  _PigeonDeviceLock() : _api = DeviceLockHostApi();

  final DeviceLockHostApi _api;

  @override
  Future<LockCapabilities> capabilities() => _api.capabilities();

  @override
  Future<BiometricResult> enrollBiometrics(BiometricPromptText text) =>
      _api.enrollBiometrics(text);

  @override
  Future<BiometricResult> unlockWithBiometrics(
    BiometricPromptText text,
    Uint8List? sealed,
  ) => _api.unlockWithBiometrics(text, sealed);

  @override
  Future<void> forgetBiometrics() => _api.forgetBiometrics();

  @override
  Future<Uint8List> pinTag(Uint8List input, {required bool create}) =>
      _api.pinTag(input, create);

  @override
  Future<void> forgetPinKey() => _api.forgetPinKey();

  @override
  Future<void> setSwitcherCover(bool enabled) => _api.setSwitcherCover(enabled);
}
