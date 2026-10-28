import 'package:bank_capture/bank_capture.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/capture/capture_controller.dart';
import 'package:smartspend_app/src/features/capture/capture_review_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';

import 'support/test_app.dart';

/// What `capture.pending` answers for one captured purchase (decision 0028).
Map<String, Object?> _pending(
  int eventId, {
  num amount = 450,
  String currency = 'EGP',
  num? amountEgp = 450,
  String confidence = 'certain',
}) => {
  'eventId': eventId,
  'createdAt': '2026-10-27T10:00:00.000Z',
  'reading': {
    'kind': 'card_purchase',
    'confidence': confidence,
    'amount': {'value': amount, 'currency': currency},
    'counterparty': {'type': 'merchant', 'name': 'CARREFOUR MAADI'},
    'sourceName': {'ar': 'البنك التجاري الدولي', 'en': 'CIB'},
  },
  'suggestion': {
    'type': 'expense',
    'categoryId': 'miscellaneous',
    'subCategoryId': 'general',
    'category': 'متنوعات',
    'subCategory': 'عام',
    'amountEgp': amountEgp,
  },
};

FakeApi _api({bool enabled = true}) => FakeApi()
  ..answer('localAuth.me', (_) => phoneUser())
  ..answer(
    'capture.status',
    (_) => {
      'enabled': enabled,
      'consent': {'capture': false, 'aiReading': false},
      'consentTextVersion': '2026-10-27',
    },
  )
  ..answer('capture.setConsent', (_) => {'capture': true, 'aiReading': false})
  ..answer(
    'capture.registerDevice',
    (_) => {'deviceId': 3, 'token': 'cap_device-token'},
  )
  ..answer('capture.pending', (_) => <Object?>[]);

Future<void> _openMore(WidgetTester tester) async {
  await tester.tap(find.text('المزيد').last);
  await tester.pumpAndSettle();
}

Future<void> _turnOn(WidgetTester tester) async {
  await tester.ensureVisible(find.text('شغّل تسجيل رسايل البنك'));
  await tester.tap(find.text('شغّل تسجيل رسايل البنك'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('موافق، كمّل'));
  await tester.pumpAndSettle();
}

/// A tall phone, so the More screen's capture card is not hidden behind the navigation bar.
void _phoneScreen(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(1080, 2400)
    ..devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets(
    'turning capture on records consent, registers this phone and hands the token to the native side',
    (tester) async {
      _phoneScreen(tester);
      final api = _api();
      final app = TestApp(token: 'session-token', api: api);
      await app.pump(tester);
      await _openMore(tester);
      await _turnOn(tester);

      expect(api.lastInput('capture.setConsent'), {
        'scope': 'capture',
        'granted': true,
        'textVersion': '2026-10-27',
      });
      final register = api.lastInput('capture.registerDevice')! as Map;
      expect(register['platform'], 'android');
      final installationId = register['installationId'] as String;
      expect(installationId, hasLength(32));
      expect(app.preferences.preferences.captureInstallationId, installationId);

      final setup = app.bankCapture.setup!;
      expect(setup.deviceToken, 'cap_device-token');
      expect(setup.ownerKey, 'local:42');
      expect(setup.language, 'ar');
      expect(setup.baseUrl, 'http://localhost:3000');
      // Access to notifications is the next step, opened for the person.
      expect(app.bankCapture.settingsOpened, 1);
    },
  );

  testWidgets('says so and connects nothing while the admin keeps it off', (
    tester,
  ) async {
    _phoneScreen(tester);
    final api = _api(enabled: false);
    final app = TestApp(token: 'session-token', api: api);
    await app.pump(tester);
    await _openMore(tester);
    await _turnOn(tester);

    expect(
      find.text('تسجيل رسايل البنك لسه مش متاح. هنقولك أول ما يبقى جاهز.'),
      findsOneWidget,
    );
    expect(api.paths, isNot(contains('capture.registerDevice')));
    expect(app.bankCapture.setup, isNull);
  });

  testWidgets('signing out forgets the capture on this phone', (tester) async {
    _phoneScreen(tester);
    final app = TestApp(token: 'session-token', api: _api());
    await app.pump(tester);
    await _openMore(tester);
    await _turnOn(tester);
    expect(app.bankCapture.setup, isNotNull);

    await tester.ensureVisible(find.text('تسجيل الخروج'));
    await tester.tap(find.text('تسجيل الخروج'));
    await tester.pumpAndSettle();

    expect(app.bankCapture.disconnects, 1);
    expect(app.bankCapture.setup, isNull);
  });

  testWidgets('shows the month against the free limit and what is held', (
    tester,
  ) async {
    _phoneScreen(tester);
    final api = _api()
      ..answer(
        'capture.status',
        (_) => {
          'enabled': true,
          'consent': {'capture': true, 'aiReading': false},
          'consentTextVersion': '2026-10-27',
          'usage': {'period': '2026-10', 'limit': 50, 'used': 50, 'held': 3},
        },
      );
    final app = TestApp(token: 'session-token', api: api);
    app.bankCapture
      ..access = CaptureAccess.granted
      ..setup = CaptureSetup(
        baseUrl: 'http://localhost:3000',
        deviceToken: 'cap_device-token',
        ownerKey: 'local:42',
        language: 'ar',
      );
    await app.pump(tester);
    await _openMore(tester);

    expect(find.text('اتسجل 50 من 50 الشهر ده.'), findsOneWidget);
    expect(
      find.text('3 عمليات محفوظة، بتتسجل لو اشتركت في Pro.'),
      findsOneWidget,
    );
  });

  group('the transactions waiting for the person', () {
    Future<(TestApp, FakeApi)> openReview(
      WidgetTester tester,
      List<Map<String, Object?>> Function() pending,
    ) async {
      _phoneScreen(tester);
      final api = _api()
        ..answer('capture.pending', (_) => pending())
        ..answer('capture.answer', (_) => {'result': 'recorded'});
      final app = TestApp(token: 'session-token', api: api);
      app.bankCapture
        ..access = CaptureAccess.granted
        ..setup = CaptureSetup(
          baseUrl: 'http://localhost:3000',
          deviceToken: 'cap_device-token',
          ownerKey: 'local:42',
          language: 'ar',
        );
      await app.pump(tester);
      app.container.read(routerProvider).go(CaptureReviewScreen.path);
      await tester.pumpAndSettle();
      return (app, api);
    }

    testWidgets('records one and dismisses another', (tester) async {
      var left = [_pending(11), _pending(12, amount: 80, amountEgp: 80)];
      final (_, api) = await openReview(tester, () => left);

      expect(find.textContaining('CARREFOUR MAADI'), findsNWidgets(2));
      expect(find.text('متنوعات · عام'), findsNWidgets(2));

      left = [left.last];
      await tester.tap(find.text('سجّل').first);
      await tester.pumpAndSettle();
      expect(api.lastInput('capture.answer'), {
        'eventId': 11,
        'action': 'record',
      });

      left = [];
      await tester.tap(find.text('مش مصروف').first);
      await tester.pumpAndSettle();
      expect(api.lastInput('capture.answer'), {
        'eventId': 12,
        'action': 'dismiss',
      });
      expect(find.text('مفيش عمليات مستنية ردك.'), findsOneWidget);
    });

    testWidgets(
      'offers a bank the person keeps confirming, and sends the answer',
      (tester) async {
        final (app, api) = await openReview(tester, () => []);
        api
          ..answer(
            'capture.autoOffers',
            (_) => [
              {
                'sourceSlug': 'cib',
                'kind': 'card_purchase',
                'streak': 3,
                'sourceName': {'ar': 'البنك التجاري الدولي', 'en': 'CIB'},
              },
            ],
          )
          ..answer('capture.setAuto', (_) => {'success': true});
        app.container.invalidate(captureAutoOffersProvider);
        await tester.pumpAndSettle();

        expect(
          find.text('نسجّل عمليات «البنك التجاري الدولي» دي لوحدها بعد كده؟'),
          findsOneWidget,
        );
        await tester.tap(find.text('أيوه'));
        await tester.pumpAndSettle();
        expect(api.lastInput('capture.setAuto'), {
          'sourceSlug': 'cib',
          'kind': 'card_purchase',
          'enabled': true,
        });
      },
    );

    testWidgets('warns when it may be the same payment as the one before', (
      tester,
    ) async {
      await openReview(
        tester,
        () => [
          {..._pending(31), 'possibleDuplicate': true},
        ],
      );

      expect(find.textContaining('ممكن تكون نفس العملية'), findsOneWidget);
    });

    testWidgets('asks for the pounds of a foreign charge before recording it', (
      tester,
    ) async {
      var left = [_pending(21, amount: 20, currency: 'USD', amountEgp: null)];
      final (_, api) = await openReview(tester, () => left);

      await tester.tap(find.text('سجّل'));
      await tester.pumpAndSettle();
      expect(api.paths, isNot(contains('capture.answer')));

      await tester.enterText(find.byType(TextField), '1010.5');
      left = [];
      await tester.tap(find.text('سجّل'));
      await tester.pumpAndSettle();
      expect(api.lastInput('capture.answer'), {
        'eventId': 21,
        'action': 'record',
        'amountEgp': 1010.5,
      });
    });
  });
}
