import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/auth/google_identity.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

Finder _field(String label) => find.widgetWithText(TextField, label);

Finder get _signInButton => find.widgetWithText(FilledButton, 'ادخل');

Finder get _googleButton => find.text('ادخل بحساب Google');

Map<String, Object?> _signedInAnswer({
  String token = 'new-session-token',
  Map<String, Object?>? user,
}) => {
  'success': true,
  'token': token,
  'user':
      user ??
      {
        'id': 42,
        'name': 'منى',
        'phone': '01012345678',
        'role': 'user',
        'plan': 'free',
      },
};

void main() {
  group('phone and password', () {
    testWidgets('signs in, keeps the token and opens the tabs', (tester) async {
      final api = FakeApi()
        ..answer('localAuth.login', (_) => _signedInAnswer())
        ..answer('localAuth.me', (_) => phoneUser());
      final app = TestApp(api: api);
      await app.pump(tester);

      // Arabic digits and the country code are accepted, as the server accepts them.
      await tester.enterText(_field('رقم التليفون'), '+2 ٠١٠١٢٣٤٥٦٧٨');
      await tester.enterText(_field('الباسورد'), 'secret-pass');
      await tester.tap(_signInButton);
      await tester.pumpAndSettle();

      expect(api.lastInput('localAuth.login'), {
        'phone': '01012345678',
        'password': 'secret-pass',
      });
      expect(app.store.token, 'new-session-token');
      expect(find.byType(NavigationBar), findsOneWidget);
      expect((app.session as SignedIn).user?.name, 'منى');
    });

    testWidgets('a wrong password shows the server message and keeps nothing', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'localAuth.login',
          (_) => throw const TrpcFailure(
            'UNAUTHORIZED',
            401,
            'رقم التليفون أو الباسورد غلط',
          ),
        );
      final app = TestApp(api: api);
      await app.pump(tester);

      await tester.enterText(_field('رقم التليفون'), '01012345678');
      await tester.enterText(_field('الباسورد'), 'wrong');
      await tester.tap(_signInButton);
      await tester.pumpAndSettle();

      expect(find.text('رقم التليفون أو الباسورد غلط'), findsOneWidget);
      expect(app.store.token, isNull);
      expect(app.session, isA<SignedOut>());
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('empty fields are asked for before anything is sent', (
      tester,
    ) async {
      final app = TestApp();
      await app.pump(tester);

      await tester.tap(_signInButton);
      await tester.pumpAndSettle();

      expect(find.text('اكتب رقم التليفون والباسورد.'), findsOneWidget);
      expect(app.api.paths, isNot(contains('localAuth.login')));
    });

    testWidgets('after too many attempts the button waits as the server asks', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'localAuth.login',
          (_) => throw const TrpcFailure(
            'TOO_MANY_REQUESTS',
            429,
            'محاولات كتير. استنى شوية وجرّب تاني.',
            retryAfterSeconds: 3,
          ),
        );
      final app = TestApp(api: api);
      await app.pump(tester);

      await tester.enterText(_field('رقم التليفون'), '01012345678');
      await tester.enterText(_field('الباسورد'), 'wrong');
      await tester.tap(_signInButton);
      await tester.pump();
      await tester.pump();

      expect(find.text('محاولات كتير. استنى شوية وجرّب تاني.'), findsOneWidget);
      expect(find.text('جرّب تاني بعد 3 ثواني.'), findsOneWidget);
      expect(tester.widget<FilledButton>(_signInButton).onPressed, isNull);

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('جرّب تاني بعد ثانيتين.'), findsOneWidget);

      await tester.pump(const Duration(seconds: 3));
      expect(find.textContaining('جرّب تاني بعد'), findsNothing);
      expect(tester.widget<FilledButton>(_signInButton).onPressed, isNotNull);
    });
  });

  group('Google', () {
    testWidgets('exchanges the ID token for a session', (tester) async {
      final api = FakeApi()
        ..answer(
          'auth.signInWithGoogle',
          (_) => _signedInAnswer(
            token: 'google-session',
            user: {
              'id': 7,
              'name': 'Sara Ali',
              'email': 'sara@example.com',
              'role': 'user',
              'plan': 'pro',
            },
          ),
        )
        ..answer('auth.me', (_) => googleUser());
      final app = TestApp(api: api, google: FakeGoogleIdentity());
      await app.pump(tester);

      await tester.tap(_googleButton);
      await tester.pumpAndSettle();

      expect(api.lastInput('auth.signInWithGoogle'), {
        'idToken': 'google-id-token',
        'nonce': 'nonce-made-for-this-sign-in-0123456789abcdef',
      });
      expect(app.store.token, 'google-session');
      expect(find.byType(NavigationBar), findsOneWidget);
    });

    testWidgets('closing the account picker changes nothing', (tester) async {
      final google = FakeGoogleIdentity()..idToken = null;
      final app = TestApp(google: google);
      await app.pump(tester);

      await tester.tap(_googleButton);
      await tester.pumpAndSettle();

      expect(google.requests, 1);
      expect(app.api.paths, isNot(contains('auth.signInWithGoogle')));
      expect(find.byType(InlineMessage), findsNothing);
      expect(app.session, isA<SignedOut>());
    });

    testWidgets('a Google failure says so in Arabic', (tester) async {
      final google = FakeGoogleIdentity()
        ..failure = const GoogleIdentityFailure('clientConfigurationError');
      final app = TestApp(google: google);
      await app.pump(tester);

      await tester.tap(_googleButton);
      await tester.pumpAndSettle();

      expect(
        find.text('ماقدرناش نكمّل الدخول بحساب Google. جرّب تاني.'),
        findsOneWidget,
      );
    });

    testWidgets('a token the server refuses shows its message', (tester) async {
      final api = FakeApi()
        ..answer(
          'auth.signInWithGoogle',
          (_) => throw const TrpcFailure(
            'UNAUTHORIZED',
            401,
            'ماقدرناش نتأكد من حساب Google. جرّب تاني.',
          ),
        );
      final app = TestApp(api: api, google: FakeGoogleIdentity());
      await app.pump(tester);

      await tester.tap(_googleButton);
      await tester.pumpAndSettle();

      expect(
        find.text('ماقدرناش نتأكد من حساب Google. جرّب تاني.'),
        findsOneWidget,
      );
      expect(app.store.token, isNull);
    });

    testWidgets('the button is hidden when this build has no Google client', (
      tester,
    ) async {
      final app = TestApp(google: FakeGoogleIdentity(isAvailable: false));
      await app.pump(tester);

      expect(_googleButton, findsNothing);
      expect(find.text('أو'), findsNothing);
    });
  });

  testWidgets('the link under the form opens the new account screen', (
    tester,
  ) async {
    final app = TestApp();
    await app.pump(tester);

    await tester.tap(find.text('اعمل حساب جديد'));
    await tester.pumpAndSettle();

    expect(find.text('حساب جديد'), findsOneWidget);
  });

  testWidgets('signing out ends the session on the server and on the phone', (
    tester,
  ) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    final google = FakeGoogleIdentity();
    final app = TestApp(token: 'stored-token', api: api, google: google);
    await app.pump(tester);

    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();
    expect(find.text('منى'), findsOneWidget);
    // The number reads left to right inside the Arabic card.
    expect(find.text(inlineName('01012345678')), findsOneWidget);

    await tester.tap(find.text('تسجيل الخروج'));
    await tester.pumpAndSettle();

    final logout = api.calls.singleWhere(
      (call) => call.path == 'localAuth.logout',
    );
    expect(logout.token, 'stored-token');
    expect(app.store.token, isNull);
    expect(google.signOuts, 1);
    expect(find.text('أهلاً بيك في SmartSpend'), findsOneWidget);
    expect(find.text('الجلسة خلصت. سجّل دخولك تاني.'), findsNothing);
  });
}
