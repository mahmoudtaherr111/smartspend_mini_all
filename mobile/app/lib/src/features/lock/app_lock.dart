import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:clock/clock.dart';
import 'package:crypto/crypto.dart';
import 'package:device_lock/device_lock.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session_controller.dart';
import 'lock_store.dart';
import 'pin_rules.dart';

final deviceLockProvider = Provider<DeviceLock>((ref) => DeviceLock());

final lockStoreProvider = Provider<LockStore>((ref) => SecureLockStore());

final appLockProvider = NotifierProvider<AppLock, LockView>(AppLock.new);

/// The app lock as the screens see it.
final class LockView {
  const LockView({
    this.ready = false,
    this.record = const LockRecord(),
    this.locked = false,
    this.capabilities,
    this.lockCount = 0,
  });

  /// False until the stored lock is read; the app shows nothing of the account until then.
  final bool ready;
  final LockRecord record;
  final bool locked;

  /// What biometrics the phone has; null when the phone could not say.
  final LockCapabilities? capabilities;

  /// Goes up each time the app locks. The lock screen offers biometrics once per lock, not on every rebuild.
  final int lockCount;

  bool get enabled => record.enabled;
  bool get biometrics => record.biometrics;
  bool get hideAmounts => record.hideAmounts;

  /// Biometrics can be turned on: the phone has them, set up, strong enough to guard a key.
  bool get biometricsReady =>
      capabilities?.availability == BiometricAvailability.ready;

  LockView copyWith({
    LockRecord? record,
    bool? locked,
    LockCapabilities? capabilities,
    int? lockCount,
  }) => LockView(
    ready: ready,
    record: record ?? this.record,
    locked: locked ?? this.locked,
    capabilities: capabilities ?? this.capabilities,
    lockCount: lockCount ?? this.lockCount,
  );
}

/// How a PIN check ended.
sealed class PinCheck {
  const PinCheck();
}

final class PinAccepted extends PinCheck {
  const PinAccepted();
}

final class PinRejected extends PinCheck {
  const PinRejected({required this.triesLeft, required this.wait});

  /// Wrong PINs left before the session ends on this phone.
  final int triesLeft;

  /// How long the pad is blocked now.
  final Duration wait;
}

/// The pad is still blocked after earlier wrong PINs.
final class PinWait extends PinCheck {
  const PinWait(this.left);

  final Duration left;
}

/// Too many wrong PINs: the session ended on this phone.
final class PinSignedOut extends PinCheck {
  const PinSignedOut();
}

/// The PIN cannot be checked: the stored lock or its key is gone. Only signing out opens the app again.
final class PinUnverifiable extends PinCheck {
  const PinUnverifiable();
}

/// The app lock: whether the app is locked, and every change to the lock (docs/decisions/0023-mobile-app-lock.md).
///
/// - A cold start opens locked. Back from the background, it locks once the app was away longer than the chosen
///   time, measured on a monotonic stopwatch, so changing the phone's clock does not skip it.
/// - The PIN is checked by its tag, made with a key that stays in the phone's Keystore or Keychain. Wrong PINs are
///   counted in the stored record; from the fifth the pad waits longer each time, and the tenth signs out.
/// - Biometrics open the app only when the key they guard gives back the secret whose hash was kept.
/// - Signing out removes the lock, its keys and the record; another account never inherits it. A session that
///   expired keeps it, and signing in again opens the app without asking, since the password was just typed.
class AppLock extends Notifier<LockView> {
  late Future<void> _loaded;
  Stopwatch? _away;
  bool _authenticating = false;

  LockStore get _store => ref.read(lockStoreProvider);
  DeviceLock get _device => ref.read(deviceLockProvider);

  @override
  LockView build() {
    final lifecycle = AppLifecycleListener(
      onHide: _wentAway,
      onResume: () => unawaited(_cameBack()),
    );
    ref.onDispose(lifecycle.dispose);
    ref.listen(
      sessionProvider,
      (previous, next) =>
          unawaited(_loaded.then((_) => _follow(previous, next))),
    );
    _loaded = _load();
    return const LockView();
  }

  Future<void> _load() async {
    final record = await _store.read();
    state = LockView(
      ready: true,
      record: record,
      locked: record.enabled,
      capabilities: await _capabilities(),
      lockCount: record.enabled ? 1 : 0,
    );
    await _cover(record.enabled);
    await _follow(null, ref.read(sessionProvider));
  }

  /// Keeps the lock to the account signed in now. Runs once the stored lock is read.
  Future<void> _follow(SessionState? previous, SessionState next) async {
    switch (next) {
      case SignedOut(expired: false):
        await _wipe();
      case SignedIn(:final user):
        if (previous is SignedOut) {
          // A sign-in just proved who this is.
          if (state.record.damaged) await _wipe();
          _unlock();
        }
        if (user == null) return;
        final key = '${user.kind.name}:${user.id}';
        final owner = state.record.accountKey;
        if (owner != null && owner != key) {
          await _wipe();
          _unlock();
        }
        if (state.record.accountKey != key && !state.record.damaged) {
          await _save(state.record.copyWith(accountKey: key));
        }
      default:
    }
  }

  void _wentAway() {
    if (!state.enabled || state.locked || _authenticating) return;
    if (state.record.relockAfter == Duration.zero) {
      // Locked before the app switcher takes its picture.
      _lock();
    } else {
      _away = clock.stopwatch()..start();
    }
  }

  Future<void> _cameBack() async {
    final away = _away;
    _away = null;
    if (away != null && away.elapsed >= state.record.relockAfter) _lock();
    // The person may have set up a fingerprint in the phone's settings meanwhile.
    final capabilities = await _capabilities();
    if (capabilities != null) {
      state = state.copyWith(capabilities: capabilities);
    }
  }

  void _lock() {
    if (!state.enabled) return;
    // The keyboard of a field under the lock would stay open over it.
    FocusManager.instance.primaryFocus?.unfocus();
    state = state.copyWith(locked: true, lockCount: state.lockCount + 1);
  }

  void _unlock() {
    if (state.locked) state = state.copyWith(locked: false);
  }

  /// Checks [pin]. With [unlock] it opens the app; without, it only confirms the person, as before changing the
  /// lock's settings. Both count wrong PINs the same way, so no screen allows unlimited guesses.
  Future<PinCheck> checkPin(String pin, {bool unlock = true}) async {
    await _loaded;
    final record = state.record;
    final salt = record.pinSalt;
    final expected = record.pinTag;
    if (record.damaged || salt == null || expected == null) {
      return const PinUnverifiable();
    }
    final now = clock.now();
    final left = PinRules.waitLeft(
      failures: record.failures,
      lastFailureAt: record.lastFailureAt,
      now: now,
    );
    if (left > Duration.zero) return PinWait(left);
    final Uint8List tag;
    try {
      tag = await _tag(salt, pin, create: false);
    } on PlatformException {
      return const PinUnverifiable();
    }
    if (sameBytes(tag, expected)) {
      if (record.failures > 0) await _save(record.withoutFailures());
      if (unlock) _unlock();
      return const PinAccepted();
    }
    final failures = record.failures + 1;
    if (failures >= PinRules.maxFailures) {
      await ref.read(sessionProvider.notifier).signOut();
      return const PinSignedOut();
    }
    await _save(record.copyWith(failures: failures, lastFailureAt: now));
    return PinRejected(
      triesLeft: PinRules.maxFailures - failures,
      wait: PinRules.waitAfter(failures),
    );
  }

  /// What is left of the wait after wrong PINs, now.
  Duration get waitLeft => PinRules.waitLeft(
    failures: state.record.failures,
    lastFailureAt: state.record.lastFailureAt,
    now: clock.now(),
  );

  /// Turns the lock on with [pin], or changes the PIN. The caller has checked the PIN is not guessable.
  Future<void> setPin(String pin) async {
    await _loaded;
    final salt = _randomBytes(16);
    final tag = await _tag(salt, pin, create: true);
    await _save(state.record.withPin(salt, tag));
    await _cover(true);
    _unlock();
  }

  /// Turns the lock off and forgets its keys. Hidden amounts stay as they are.
  Future<void> turnOff() async {
    await _forgetKeys();
    await _save(state.record.withoutLock());
    await _cover(false);
    _unlock();
  }

  Future<BiometricOutcome> turnOnBiometrics(BiometricPromptText text) async {
    final result = await _authenticate(() => _device.enrollBiometrics(text));
    final secret = result.secret;
    if (result.outcome != BiometricOutcome.success || secret == null) {
      return result.outcome == BiometricOutcome.success
          ? BiometricOutcome.failed
          : result.outcome;
    }
    await _save(state.record.withBiometrics(_hash(secret), result.sealed));
    return BiometricOutcome.success;
  }

  Future<void> turnOffBiometrics() async {
    try {
      await _device.forgetBiometrics();
    } on Object {
      // The key goes with the record either way.
    }
    await _save(state.record.withBiometrics(null, null));
  }

  /// Opens the app with biometrics. Success needs the key to give back the very secret whose hash was kept.
  Future<BiometricOutcome> unlockWithBiometrics(
    BiometricPromptText text,
  ) async {
    await _loaded;
    final record = state.record;
    final check = record.biometricCheck;
    if (check == null) return BiometricOutcome.unavailable;
    final result = await _authenticate(
      () => _device.unlockWithBiometrics(text, record.biometricSealed),
    );
    switch (result.outcome) {
      case BiometricOutcome.success:
        final secret = result.secret;
        if (secret == null || !sameBytes(_hash(secret), check)) {
          return BiometricOutcome.failed;
        }
        if (record.failures > 0) await _save(record.withoutFailures());
        _unlock();
        return BiometricOutcome.success;
      case BiometricOutcome.changed:
        // Someone added or removed a face or finger: biometrics stay off until the PIN turns them on again.
        await _save(state.record.withBiometrics(null, null));
        return BiometricOutcome.changed;
      case final other:
        return other;
    }
  }

  Future<void> setRelockAfter(Duration after) =>
      _save(state.record.copyWith(relockAfter: after));

  Future<void> setHideAmounts(bool hide) =>
      _save(state.record.copyWith(hideAmounts: hide));

  Future<BiometricResult> _authenticate(
    Future<BiometricResult> Function() prompt,
  ) async {
    _authenticating = true;
    try {
      return await prompt();
    } on Object {
      return BiometricResult(outcome: BiometricOutcome.failed);
    } finally {
      _authenticating = false;
    }
  }

  Future<Uint8List> _tag(Uint8List salt, String pin, {required bool create}) =>
      _device.pinTag(
        Uint8List.fromList([...salt, ...utf8.encode(pin)]),
        create: create,
      );

  Future<void> _save(LockRecord record) async {
    if (record.damaged) return;
    state = state.copyWith(record: record);
    await _store.write(record);
  }

  Future<void> _wipe() async {
    await _forgetKeys();
    await _cover(false);
    await _store.clear();
    _away = null;
    state = LockView(ready: true, capabilities: state.capabilities);
  }

  Future<void> _forgetKeys() async {
    try {
      await _device.forgetBiometrics();
      await _device.forgetPinKey();
    } on Object {
      // A phone without the plugin's keys has nothing to forget.
    }
  }

  Future<void> _cover(bool enabled) async {
    try {
      await _device.setSwitcherCover(enabled);
    } on Object {
      // The cover is a second layer: the lock screen already hides the app.
    }
  }

  Future<LockCapabilities?> _capabilities() async {
    try {
      return await _device.capabilities();
    } on Object {
      return null;
    }
  }

  static Uint8List _hash(Uint8List secret) =>
      Uint8List.fromList(sha256.convert(secret).bytes);

  static Uint8List _randomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList([
      for (var i = 0; i < length; i++) random.nextInt(256),
    ]);
  }
}
