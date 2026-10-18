// Screenshots of the app on a real Android emulator and iOS simulator, for people who review the app without a
// phone or a Mac. .github/workflows/mobile-screenshots.yml runs it on GitHub's machines:
//   flutter drive --driver=test_driver/integration_test.dart --target=integration_test/screenshots_test.dart
// and test_driver/integration_test.dart saves each picture under build/screenshots/.
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/providers.dart';

/// The tabs in the order of the bottom bar, by their Arabic label and a file-name slug.
const _tabs = [
  ('تسجيل', 'record'),
  ('إحصائيات', 'stats'),
  ('مركز AI', 'ai'),
  ('تقويم', 'calendar'),
  ('المزيد', 'more'),
];

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('every tab, dark and light', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(AppConfig.fromEnvironment()),
        ],
        child: const SmartSpendApp(),
      ),
    );
    await tester.pumpAndSettle();
    // Android draws Flutter on a surface the screenshot cannot read until it becomes an image.
    if (Platform.isAndroid) await binding.convertFlutterSurfaceToImage();

    for (final (theme, brightness) in [
      ('dark', Brightness.dark),
      ('light', Brightness.light),
    ]) {
      tester.platformDispatcher.platformBrightnessTestValue = brightness;
      for (final (index, (label, slug)) in _tabs.indexed) {
        await tester.tap(find.text(label).last);
        await tester.pumpAndSettle();
        await binding.takeScreenshot(
          '${Platform.operatingSystem}-$theme-${index + 1}-$slug',
        );
      }
    }
    tester.platformDispatcher.clearPlatformBrightnessTestValue();
  });
}
