// The server can require a newer build and stop an AI feature; neither may ever lock a person out by accident.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/infrastructure/app_update_screen.dart';
import 'package:smartspend_app/src/features/infrastructure/remote_config.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

void main() {
  test('versions compare part by part', () {
    expect(isOlderVersion('1.9.0', '1.10.0'), isTrue);
    expect(isOlderVersion('1.10.0', '1.9.0'), isFalse);
    expect(isOlderVersion('1.2', '1.2.0'), isFalse);
    expect(isOlderVersion('1.2.0', '1.2.1'), isTrue);
  });

  test('a missing or broken minimum requires nothing', () {
    expect(isOlderVersion('1.0.0', ''), isFalse);
    expect(isOlderVersion('1.0.0', 'latest'), isFalse);
  });

  test('reads the values of this platform', () {
    final config = RemoteConfig.fromJson({
      'minVersion': {'android': '2.0.0', 'ios': '3.0.0'},
      'storeUrl': {'android': 'https://play.example', 'ios': ''},
      'aiOff': ['speech'],
    }, 'android');
    expect(config.minVersion, '2.0.0');
    expect(config.storeUrl, 'https://play.example');
    expect(config.aiOff, {'speech'});
  });

  testWidgets('a stopped feature leaves the record tab', (tester) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(api);
    api.answer(
      'appConfig.get',
      (_) => {
        'aiOff': ['speech', 'image'],
      },
    );
    await TestApp(token: 'stored-token', api: api).pump(tester);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.mic_rounded), findsNothing);
    expect(find.byIcon(Icons.camera_alt_outlined), findsNothing);
    expect(find.byType(AppUpdateScreen), findsNothing);
  });
}
