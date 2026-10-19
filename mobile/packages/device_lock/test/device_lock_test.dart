import 'package:device_lock/device_lock.dart';
import 'package:device_lock/src/device_lock_api.g.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const prefix = 'dev.flutter.pigeon.device_lock.DeviceLockHostApi';
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const codec = DeviceLockHostApi.pigeonChannelCodec;
  final text = BiometricPromptText(
    title: 'افتح SmartSpend',
    reason: 'عشان تشوف حساباتك',
    usePin: 'استخدم الرمز السري',
  );

  /// Answers [method] on the native side with [reply], and records what Dart sent it.
  List<Object?> answer(String method, Object? reply) {
    final sent = <Object?>[];
    messenger.setMockMessageHandler('$prefix.$method', (message) async {
      sent.add(codec.decodeMessage(message));
      return codec.encodeMessage(<Object?>[reply]);
    });
    addTearDown(() => messenger.setMockMessageHandler('$prefix.$method', null));
    return sent;
  }

  test('capabilities() reads what the phone has', () async {
    answer(
      'capabilities',
      LockCapabilities(
        kind: BiometricKind.face,
        availability: BiometricAvailability.notEnrolled,
      ),
    );

    final capabilities = await DeviceLock().capabilities();

    expect(capabilities.kind, BiometricKind.face);
    expect(capabilities.availability, BiometricAvailability.notEnrolled);
  });

  test(
    'unlocking passes the sealed secret and returns the opened one',
    () async {
      final sealed = Uint8List.fromList(List.filled(44, 7));
      final sent = answer(
        'unlockWithBiometrics',
        BiometricResult(
          outcome: BiometricOutcome.success,
          secret: Uint8List.fromList(List.filled(32, 1)),
        ),
      );

      final result = await DeviceLock().unlockWithBiometrics(text, sealed);

      expect(result.outcome, BiometricOutcome.success);
      expect(result.secret, hasLength(32));
      final args = sent.single! as List<Object?>;
      expect((args[0]! as BiometricPromptText).usePin, 'استخدم الرمز السري');
      expect(args[1], sealed);
    },
  );

  test('a changed biometric comes back as an outcome, not an error', () async {
    answer(
      'unlockWithBiometrics',
      BiometricResult(outcome: BiometricOutcome.changed),
    );

    final result = await DeviceLock().unlockWithBiometrics(text, null);

    expect(result.outcome, BiometricOutcome.changed);
    expect(result.secret, isNull);
  });

  test('pinTag() says whether it may make the key', () async {
    final sent = answer('pinTag', Uint8List(32));

    await DeviceLock().pinTag(Uint8List.fromList([1, 2, 3]), create: false);

    expect((sent.single! as List<Object?>)[1], false);
  });

  test('a missing PIN key surfaces as a PlatformException', () async {
    messenger.setMockMessageHandler('$prefix.pinTag', (_) async {
      return codec.encodeMessage(<Object?>['no-pin-key', 'gone', null]);
    });
    addTearDown(() => messenger.setMockMessageHandler('$prefix.pinTag', null));

    await expectLater(
      DeviceLock().pinTag(Uint8List(1), create: false),
      throwsA(
        isA<PlatformException>().having((e) => e.code, 'code', 'no-pin-key'),
      ),
    );
  });
}
