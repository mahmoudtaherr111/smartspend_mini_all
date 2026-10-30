import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

/// Pumps a few frames: the panel's countdown ticks every second, so it never settles.
Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Finder get _codeField => _field('كود التأكيد');

FakeApi _verifyingApi() => FakeApi()
  ..answer('localAuth.getVerificationSettings', (_) => {'enabled': true})
  ..answer(
    'localAuth.generateVerificationCode',
    (_) => {
      'success': true,
      'ticket': '9.ticket',
      'expiresInSeconds': 600,
      'resendInSeconds': 60,
    },
  )
  ..answer('localAuth.confirmVerificationCode', (_) => {'verified': true})
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
    testWidgets('the code sent on WhatsApp, typed back, creates the account', (
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
      expect(find.text('أكّد رقمك'), findsOneWidget);
      expect(find.text('الكود صالح لمدة 10:00'), findsOneWidget);
      expect(find.text('ابعت كود جديد بعد 60 ثانية'), findsOneWidget);
      expect(api.paths, isNot(contains('localAuth.register')));

      await tester.pump(const Duration(seconds: 2));
      expect(find.text('الكود صالح لمدة 9:58'), findsOneWidget);

      // Six digits confirm on their own; Arabic-Indic digits are read as the same code.
      await tester.enterText(_codeField, '٤٨٢٩١٣');
      await tester.pumpAndSettle();

      expect(api.lastInput('localAuth.confirmVerificationCode'), {
        'verificationTicket': '9.ticket',
        'code': '482913',
      });
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

    testWidgets('a wrong code shows the server message and clears the field', (
      tester,
    ) async {
      final api = _verifyingApi()
        ..answer(
          'localAuth.confirmVerificationCode',
          (_) => throw const TrpcFailure(
            'BAD_REQUEST',
            400,
            'الكود غلط. فاضل 4 محاولات.',
          ),
        );
      final app = TestApp(api: api);
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.enterText(_codeField, '111111');
      await _frames(tester);

      expect(find.text('الكود غلط. فاضل 4 محاولات.'), findsOneWidget);
      expect(tester.widget<TextField>(_codeField).controller!.text, isEmpty);
      expect(api.paths, isNot(contains('localAuth.register')));
      expect(app.session, isA<SignedOut>());
    });

    testWidgets('confirming fewer than six digits asks for the whole code', (
      tester,
    ) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.enterText(_codeField, '4829');
      await tester.tap(find.widgetWithText(FilledButton, 'تأكيد'));
      await _frames(tester);

      expect(find.text('الكود 6 أرقام.'), findsOneWidget);
      expect(
        app.api.paths,
        isNot(contains('localAuth.confirmVerificationCode')),
      );
    });

    testWidgets('a new code can be asked for after the wait', (tester) async {
      final api = _verifyingApi();
      final app = TestApp(api: api);
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);
      int sends() => api.paths
          .where((path) => path == 'localAuth.generateVerificationCode')
          .length;
      expect(sends(), 1);

      await tester.tap(find.text('ابعت كود جديد بعد 60 ثانية'));
      await _frames(tester);
      expect(sends(), 1);

      await tester.pump(const Duration(seconds: 60));
      await tester.tap(find.text('ابعت كود جديد'));
      await _frames(tester);

      expect(sends(), 2);
      expect(find.text('بعتنالك كود جديد.'), findsOneWidget);
    });

    testWidgets('the countdown running out goes back to the form', (
      tester,
    ) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.pump(const Duration(minutes: 10));
      await tester.pumpAndSettle();

      expect(find.text('الكود انتهى. اطلب كود جديد.'), findsOneWidget);
      expect(_registerButton, findsOneWidget);
      expect(app.api.paths, isNot(contains('localAuth.register')));
    });

    testWidgets('a number without WhatsApp says so on the form', (
      tester,
    ) async {
      final api = _verifyingApi()
        ..answer(
          'localAuth.generateVerificationCode',
          (_) => throw const TrpcFailure(
            'BAD_REQUEST',
            400,
            'الرقم ده مش عليه واتساب. اتأكد من الرقم وجرّب تاني.',
          ),
        );
      final app = TestApp(api: api);
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await tester.pumpAndSettle();

      expect(
        find.text('الرقم ده مش عليه واتساب. اتأكد من الرقم وجرّب تاني.'),
        findsOneWidget,
      );
      expect(_registerButton, findsOneWidget);
    });

    testWidgets('changing the number returns to the form', (tester) async {
      final app = TestApp(api: _verifyingApi());
      await _fillForm(tester, app);
      await _tapRegister(tester);
      await _frames(tester);

      await tester.tap(find.text('تعديل الرقم'));
      await tester.pumpAndSettle();

      expect(_registerButton, findsOneWidget);
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
      await tester.tap(find.text('تعديل الرقم'));
      await tester.pumpAndSettle();
      expect(resets.last, 1);
      await _tapRegister(tester);
      await tester.pumpAndSettle();
      expect(find.text('استنى لحظة لحد ما التحقق يخلص.'), findsOneWidget);
    });
  });
}
