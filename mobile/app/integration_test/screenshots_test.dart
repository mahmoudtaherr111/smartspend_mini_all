// Screenshots of the app on a real Android emulator and iOS simulator, for people who review the app without a
// phone or a Mac. .github/workflows/mobile-screenshots.yml runs it on GitHub's machines:
//   flutter drive --driver=test_driver/integration_test.dart --target=integration_test/screenshots_test.dart
// and test_driver/integration_test.dart saves each picture under build/screenshots/.
//
// The API is the widget tests' fake (test/support/test_app.dart), so no server is needed; the bank capture card
// talks to the real native code of the phone. A new screen belongs here, so its picture reaches the gallery.
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/l10n/app_localizations.dart';
import 'package:smartspend_ui/gallery.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../test/support/test_app.dart';

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

  /// The app as it opens on a phone, signed in when [token] is given, with the fake API behind it.
  Future<void> openApp(WidgetTester tester, {String? token}) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    await tester.pumpWidget(
      ProviderScope(
        key: UniqueKey(),
        overrides: [
          appConfigProvider.overrideWithValue(AppConfig.fromEnvironment()),
          sessionStoreProvider.overrideWithValue(MemorySessionStore(token)),
          httpClientProvider.overrideWithValue(api.client),
        ],
        child: const SmartSpendApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('sign-in, sign-up and every tab, dark and light', (tester) async {
    var shot = 0;
    Future<void> photograph(String theme, String slug) async {
      shot++;
      // Two digits keep the gallery in order past the ninth picture.
      final number = shot.toString().padLeft(2, '0');
      await binding.takeScreenshot(
        '${Platform.operatingSystem}-$theme-$number-$slug',
      );
    }

    await openApp(tester);
    // Android draws Flutter on a surface the screenshot cannot read until it becomes an image.
    if (Platform.isAndroid) await binding.convertFlutterSurfaceToImage();

    for (final (theme, brightness) in [
      ('dark', Brightness.dark),
      ('light', Brightness.light),
    ]) {
      shot = 0;
      tester.platformDispatcher.platformBrightnessTestValue = brightness;

      await openApp(tester);
      await photograph(theme, 'sign-in');
      await tester.tap(find.text('اعمل حساب جديد'));
      await tester.pumpAndSettle();
      await photograph(theme, 'register');

      await openApp(tester, token: 'screenshot-session');
      for (final (label, slug) in _tabs) {
        await tester.tap(find.text(label).last);
        await tester.pumpAndSettle();
        await photograph(theme, slug);
      }

      // The design system's components, page by page. Skeletons keep moving, so the page is drawn, not settled.
      await tester.pumpWidget(
        MaterialApp(
          key: UniqueKey(),
          debugShowCheckedModeBanner: false,
          theme: SmartSpendTheme.light(),
          darkTheme: SmartSpendTheme.dark(),
          locale: const Locale('ar'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: const ComponentGallery(),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));
      for (final page in ['gallery1', 'gallery2', 'gallery3']) {
        await photograph(theme, page);
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -650));
        await tester.pump(const Duration(milliseconds: 600));
      }
    }
    tester.platformDispatcher.clearPlatformBrightnessTestValue();
  });
}
