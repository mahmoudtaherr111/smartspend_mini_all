import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/core/preferences.dart';

import 'support/test_app.dart';

TextDirection _directionOf(WidgetTester tester, Finder finder) =>
    Directionality.of(tester.element(finder));

void main() {
  testWidgets(
    'English turns the interface left to right, while what people recorded stays Arabic',
    (tester) async {
      final api = FakeApi()
        ..answer('localAuth.me', (_) => phoneUser())
        ..answer(
          'expense.list',
          (_) => {
            'items': [
              {
                'id': 1,
                'amount': '185',
                'type': 'expense',
                'category': 'أكل وشرب',
                'subCategory': null,
                'description': null,
                'date': DateTime.now()
                    .subtract(const Duration(hours: 1))
                    .toUtc()
                    .toIso8601String(),
              },
            ],
            'total': 1,
          },
        );
      final app = TestApp(token: 'session-token', api: api);
      await app.pump(tester);
      expect(find.text('آخر العمليات'), findsOneWidget);

      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('لغة التطبيق'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();

      expect(find.text('App language'), findsOneWidget);
      expect(
        _directionOf(tester, find.text('App language')),
        TextDirection.ltr,
      );
      expect(app.preferences.preferences.language, AppLanguage.english);

      await tester.tap(find.text('Record').last);
      await tester.pumpAndSettle();
      expect(find.text('Latest transactions'), findsOneWidget);
      // The category is the person's own Arabic, never translated.
      expect(find.text('أكل وشرب'), findsWidgets);
      expect(find.textContaining('EGP'), findsWidgets);
    },
  );

  testWidgets('the chosen language is there from the first frame', (
    tester,
  ) async {
    final app = TestApp()
      ..preferences.preferences = const DevicePreferences(
        language: AppLanguage.english,
      );
    await app.pump(tester, settle: false);
    await tester.pump();

    expect(find.textContaining('أهلاً'), findsNothing);
    expect(
      _directionOf(tester, find.byType(Scaffold).first),
      TextDirection.ltr,
    );
  });

  testWidgets('it stays after signing out, and sign-in can switch it', (
    tester,
  ) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    final app = TestApp(token: 'session-token', api: api)
      ..preferences.preferences = const DevicePreferences(
        language: AppLanguage.english,
      );
    await app.pump(tester);

    await tester.tap(find.text('More').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(app.preferences.preferences.language, AppLanguage.english);
    expect(find.text('العربية'), findsOneWidget);

    await tester.tap(find.text('العربية'));
    await tester.pumpAndSettle();

    expect(find.text('English'), findsOneWidget);
    expect(_directionOf(tester, find.text('English')), TextDirection.rtl);
    expect(app.preferences.preferences.language, AppLanguage.arabic);
  });
}
