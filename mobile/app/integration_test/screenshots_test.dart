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

/// A month as an Egyptian user might have it, so the record tab and the full list show real content.
void _answerLedger(FakeApi api) {
  final now = DateTime.now();
  Map<String, Object?> entry(
    int id,
    String amount,
    String category, {
    String type = 'expense',
    String? description,
    String? sub,
    int daysAgo = 0,
    int hour = 13,
  }) => {
    'id': id,
    'amount': amount,
    'type': type,
    'category': category,
    'subCategory': sub,
    'description': description,
    'date': DateTime(
      now.year,
      now.month,
      now.day - daysAgo,
      hour,
      20,
    ).toUtc().toIso8601String(),
  };
  final entries = [
    entry(9, '185.00', 'أكل وشرب', description: 'Talabat', hour: 21),
    entry(
      8,
      '96.00',
      'مواصلات',
      description: 'UBER *TRIP',
      sub: 'أوبر/كريم',
      hour: 9,
    ),
    entry(7, '50.00', 'أكل وشرب', sub: 'قهوة وكافيه', hour: 8),
    entry(
      6,
      '15000.00',
      'مرتب',
      type: 'income',
      sub: 'مرتب أساسي',
      daysAgo: 1,
      hour: 10,
    ),
    entry(5, '1250.00', 'فواتير', sub: 'كهرباء', daysAgo: 1, hour: 18),
    entry(4, '320.00', 'تسوق', description: 'Carrefour', daysAgo: 2, hour: 19),
    entry(
      3,
      '500.00',
      'تحويل',
      type: 'transfer',
      sub: 'انستاباي',
      daysAgo: 3,
      hour: 12,
    ),
  ];
  api
    ..answer(
      'expense.getMonthSummary',
      (_) => {
        'totalIncome': '15000.00',
        'totalExpense': '4250.50',
        'count': 23,
      },
    )
    ..answer('expense.list', (_) => {'items': entries, 'total': entries.length})
    ..answer(
      'ai.parseExpense',
      (_) => {
        'decision': 'review',
        'items': [
          {
            'amount': 50,
            'type': 'expense',
            'category': 'أكل وشرب',
            'subCategory': 'قهوة وكافيه',
            'description': 'قهوة',
          },
          {
            'amount': 120,
            'type': 'expense',
            'category': 'مواصلات',
            'subCategory': 'أوبر/كريم',
            'description': 'أوبر',
          },
        ],
      },
    );
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  /// The app as it opens on a phone, signed in when [token] is given, with the fake API behind it.
  Future<void> openApp(WidgetTester tester, {String? token}) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    _answerLedger(api);
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

      // A sentence to review, then every transaction.
      await tester.tap(find.text('تسجيل').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'قهوة 50 وأوبر 120');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tester.pumpAndSettle();
      await photograph(theme, 'review');
      await tester.tap(find.text('عدّل الجملة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الكل'));
      await tester.pumpAndSettle();
      await photograph(theme, 'transactions');

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
