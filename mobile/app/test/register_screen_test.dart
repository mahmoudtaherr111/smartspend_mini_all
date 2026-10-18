import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';

import 'support/test_app.dart';

Finder _field(String label) => find.widgetWithText(TextField, label);

Finder get _registerButton => find.widgetWithText(FilledButton, 'اعمل الحساب');

Map<String, Object?> _created() => {
  'success': true,
  'token': 'new-account-token',
  'user': {
    'id': 43,
    'name': 'منى',
    'phone': '01012345678',
    'role': 'user',
    'plan': 'free',
  },
};

/// Opens the new account screen from sign-in and fills the form.
Future<void> _fillForm(
  WidgetTester tester,
  TestApp app, {
  String password = 'secret-pass',
}) async {
  await app.pump(tester);
  await tester.tap(find.text('اعمل حساب جديد'));
  await tester.pumpAndSettle();
  await tester.enterText(_field('اسمك'), 'منى');
  await tester.enterText(_field('رقم التليفون'), '0101 234 5678');
  await tester.enterText(_field('الباسورد'), password);
  await tester.enterText(_field('كود دعوة (لو معاك)'), 'SSFRIEND');
}

Future<void> _tapRegister(WidgetTester tester) async {
  await tester.ensureVisible(_registerButton);
  await tester.tap(_registerButton);
}

/// Pumps a few frames: the verification panel spins while it waits, so it never settles.
Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

FakeApi _verifyingApi() => FakeApi()
  ..answer('localAuth.getVerificationSettings', (_) => {'enabled': true})
  ..answer(
    'localAuth.generateVerificationCode',
    (_) => {
      'success': true,
      'code': 'SS-123456',
      'ticket': '9.ticket',
      'watch': '9.watch',
      'expiresInSeconds': 600,
    },
  )
  ..answer('localAuth.register', (_) => _created())
  ..answer('localAuth.me', (_) => phoneUser());

void main() {
  testWidgets('with verification off the account is created at once', (
    tester,
  ) async {
    final api = FakeApi()
      ..answer('localAuth.register', (_) => _created())
      ..answer('localAuth.me', (_) => phoneUser());
    final app = TestApp(api: api);
    await _fillForm(tester, app);

    await _tapRegister(tester);
    await tester.pumpAndSettle();

    expect(api.lastInput('localAuth.register'), {
      'name': 'منى',
      'phone': '01012345678',
      'password': 'secret-pass',
      'referralCode': 'SSFRIEND',
    });
    expect(api.paths, isNot(contains('localAuth.generateVerificationCode')));
    expect(app.store.token, 'new-account-token');
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('a short password is caught before anything is sent', (
    tester,
  ) async {
    final app = TestApp();
    await _fillForm(tester, app, password: '123');

    await _tapRegister(tester);
    await tester.pumpAndSettle();

    expect(find.text('الباسورد لازم يكون 6 حروف على الأقل.'), findsOneWidget);
    expect(app.api.paths, isNot(contains('localAuth.register')));
  });

  testWidgets('a number already registered shows the server message', (
    tester,
  ) async {
    final api = FakeApi()
      ..answer(
        'localAuth.register',
        (_) => throw const TrpcFailure(
          'CONFLICT',
          409,
          'رقم التليفون مسجل بالفعل',
        ),
      );
    final app = TestApp(api: api);
    await _fillForm(tester, app);

    await _tapRegister(tester);
    await tester.pumpAndSettle();

    expect(find.text('رقم التليفون مسجل بالفعل'), findsOneWidget);
    expect(app.store.token, isNull);
  });

  group('with WhatsApp verification on', () {
    testWidgets('the account is created once the bot sees the code', (
      tester,
    ) async {
      final api = _verifyingApi();
      final app = TestApp(api: api);
      await _fillForm(tester, app);

      await _tapRegister(tester);
      await _frames(tester);

      expect(api.lastInput('localAuth.generateVerificationCode'), {
        'phone': '01012345678',
      });
      expect(find.text('أكّد رقمك من واتساب'), findsOneWidget);
      expect(find.text('SS-123456'), findsOneWidget);
      expect(find.text('فاضل 10:00'), findsOneWidget);
      expect(app.challenges.watches, ['9.watch']);
      expect(api.paths, isNot(contains('localAuth.register')));

      await tester.tap(find.text('ابعته من واتساب'));
      await _frames(tester);
      expect(
        app.openedLinks.single.toString(),
        'https://wa.me/201555000111?text=${Uri.encodeComponent('تفعيل حسابي: SS-123456')}',
      );

      await tester.pump(const Duration(seconds: 2));
      expect(find.text('فاضل 9:58'), findsOneWidget);

      app.challenges.send(PhoneChallengeOutcome.verified);
      await tester.pumpAndSettle();

      expect(api.lastInput('localAuth.register'), {
        'name': 'منى',
        'phone': '01012345678',
        'password': 'secret-pass',
        'referralCode': 'SSFRIEND',
        'verificationTicket': '9.ticket',
      });
      expect(app.store.token, 'new-account-token');
      expect(find.byType(NavigationBar), findsOneWidget);
    });

    testWidgets('a code from another number warns and keeps waiting', (
      tester,
    ) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      app.challenges.send(PhoneChallengeOutcome.wrongSender);
      await _frames(tester);

      expect(
        find.text(
          'الكود وصل من رقم واتساب غير الرقم اللي بتسجّل بيه. ابعته من نفس الرقم.',
        ),
        findsOneWidget,
      );
      expect(app.challenges.watches, ['9.watch', '9.watch']);
      expect(app.challenges.connected, isTrue);
      expect(app.session, isA<SignedOut>());
    });

    testWidgets('an expired challenge goes back to the form', (tester) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      app.challenges.send(PhoneChallengeOutcome.expired);
      await tester.pumpAndSettle();

      expect(find.text('وقت التأكيد خلص. اطلب كود جديد.'), findsOneWidget);
      expect(_registerButton, findsOneWidget);
      expect(app.api.paths, isNot(contains('localAuth.register')));
    });

    testWidgets('the countdown running out ends the wait too', (tester) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.pump(const Duration(minutes: 10));
      await tester.pumpAndSettle();

      expect(find.text('وقت التأكيد خلص. اطلب كود جديد.'), findsOneWidget);
    });

    testWidgets('coming back from WhatsApp opens a fresh connection', (
      tester,
    ) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);
      expect(app.challenges.watches, hasLength(1));

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await _frames(tester);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _frames(tester);

      expect(app.challenges.watches, hasLength(2));
      expect(app.challenges.connected, isTrue);

      app.challenges.send(PhoneChallengeOutcome.verified);
      await tester.pumpAndSettle();
      expect(find.byType(NavigationBar), findsOneWidget);
    });

    testWidgets('back from the code returns to the form and stops waiting', (
      tester,
    ) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.tap(find.text('رجوع وتعديل'));
      await tester.pumpAndSettle();

      expect(_registerButton, findsOneWidget);
      expect(app.challenges.connected, isFalse);
    });

    testWidgets('the robot check must pass first, and its token is sent once', (
      tester,
    ) async {
      ValueChanged<String?>? giveToken;
      final resets = <int>[];
      final api = _verifyingApi();
      final app = TestApp(
        api: api,
        humanCheck: (onToken, resetSignal) {
          giveToken = onToken;
          resets.add(resetSignal);
          return const SizedBox(key: Key('human-check'), height: 72);
        },
      );
      await _fillForm(tester, app);
      expect(find.byKey(const Key('human-check')), findsOneWidget);

      await _tapRegister(tester);
      await tester.pumpAndSettle();
      expect(find.text('استنى لحظة لحد ما التحقق يخلص.'), findsOneWidget);
      expect(api.paths, isNot(contains('localAuth.generateVerificationCode')));

      giveToken!('turnstile-token');
      await tester.pump();
      await _tapRegister(tester);
      await _frames(tester);

      expect(api.lastInput('localAuth.generateVerificationCode'), {
        'phone': '01012345678',
        'turnstileToken': 'turnstile-token',
      });
      // Back on the form, the check is asked for a fresh token, and the spent one is not sent again.
      await tester.tap(find.text('رجوع وتعديل'));
      await tester.pumpAndSettle();
      expect(resets.last, 1);
      await _tapRegister(tester);
      await tester.pumpAndSettle();
      expect(find.text('استنى لحظة لحد ما التحقق يخلص.'), findsOneWidget);
    });

    testWidgets('without a connected bot the button says so', (tester) async {
      final api = _verifyingApi()
        ..answer('localAuth.getBotPhoneNumber', (_) => '201000000000');
      final app = TestApp(api: api);
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.tap(find.text('ابعته من واتساب'));
      await _frames(tester);

      expect(app.openedLinks, isEmpty);
      expect(
        find.text(
          'بوت الواتساب مش شغّال دلوقتي. جرّب كمان شوية، أو ادخل بطريقة تانية.',
        ),
        findsOneWidget,
      );
    });
  });
}
