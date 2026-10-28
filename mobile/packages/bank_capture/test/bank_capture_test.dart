import 'package:bank_capture/bank_capture.dart';
import 'package:bank_capture/src/bank_capture_api.g.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const getStatusChannel =
      'dev.flutter.pigeon.bank_capture.BankCaptureHostApi.getStatus';
  const openSettingsChannel =
      'dev.flutter.pigeon.bank_capture.BankCaptureHostApi.openAccessSettings';
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const codec = BankCaptureHostApi.pigeonChannelCodec;

  tearDown(() {
    messenger.setMockMessageHandler(getStatusChannel, null);
    messenger.setMockMessageHandler(openSettingsChannel, null);
  });

  test('status() reads what the native side answers', () async {
    messenger.setMockMessageHandler(getStatusChannel, (_) async {
      return codec.encodeMessage(<Object?>[
        CaptureStatus(
          method: CaptureMethod.notificationListener,
          access: CaptureAccess.notGranted,
          connected: false,
          notificationsAllowed: true,
          waiting: 3,
        ),
      ]);
    });

    final status = await BankCapture().status();

    expect(status.method, CaptureMethod.notificationListener);
    expect(status.access, CaptureAccess.notGranted);
    expect(status.waiting, 3);
  });

  test(
    'connect() hands the native side the token, the account and the language',
    () async {
      const channel =
          'dev.flutter.pigeon.bank_capture.BankCaptureHostApi.connect';
      CaptureSetup? received;
      messenger.setMockMessageHandler(channel, (message) async {
        final args = codec.decodeMessage(message) as List<Object?>;
        received = args.single as CaptureSetup?;
        return codec.encodeMessage(<Object?>[null]);
      });

      await BankCapture().connect(
        CaptureSetup(
          baseUrl: 'https://api.example.com',
          deviceToken: 'cap_test',
          ownerKey: 'local:7',
          language: 'ar',
        ),
      );
      messenger.setMockMessageHandler(channel, null);

      expect(received?.ownerKey, 'local:7');
      expect(received?.deviceToken, 'cap_test');
    },
  );

  test('openAccessSettings() reaches the native side', () async {
    var opened = 0;
    messenger.setMockMessageHandler(openSettingsChannel, (_) async {
      opened++;
      return codec.encodeMessage(<Object?>[null]);
    });

    await BankCapture().openAccessSettings();

    expect(opened, 1);
  });

  test('a native error surfaces as a PlatformException', () async {
    messenger.setMockMessageHandler(getStatusChannel, (_) async {
      return codec.encodeMessage(<Object?>['detached', 'not attached', null]);
    });

    await expectLater(
      BankCapture().status(),
      throwsA(isA<PlatformException>()),
    );
  });
}
