import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/auth/auth_api.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_app/src/routing/app_router.dart';

import 'support/test_app.dart';

const _sessionEnded = 'الجلسة خلصت. سجّل دخولك تاني.';

Finder get _signInScreen => find.text('أهلاً بيك في SmartSpend');

void main() {
  group('sessionRedirect', () {
    const user = AppUser(id: 1, kind: AccountKind.phone, name: 'منى');

    test('signed out, only the sign-in screens open', () {
      expect(sessionRedirect(const SignedOut(), '/record'), '/sign-in');
      expect(sessionRedirect(const SignedOut(), '/more'), '/sign-in');
      expect(sessionRedirect(const SignedOut(), '/starting'), '/sign-in');
      expect(sessionRedirect(const SignedOut(), '/sign-in'), isNull);
      expect(sessionRedirect(const SignedOut(), '/sign-in/register'), isNull);
    });

    test('signed in, the sign-in screens lead to the first tab', () {
      expect(sessionRedirect(const SignedIn(user), '/sign-in'), '/record');
      expect(
        sessionRedirect(const SignedIn(user), '/sign-in/register'),
        '/record',
      );
      expect(sessionRedirect(const SignedIn(user), '/starting'), '/record');
      expect(sessionRedirect(const SignedIn(user), '/more'), isNull);
      expect(sessionRedirect(const SignedIn(null), '/stats'), isNull);
    });

    test(
      'while the token is read, everything waits on the starting screen',
      () {
        expect(
          sessionRedirect(const SessionRestoring(), '/record'),
          '/starting',
        );
        expect(
          sessionRedirect(const SessionRestoring(), '/sign-in'),
          '/starting',
        );
        expect(sessionRedirect(const SessionRestoring(), '/starting'), isNull);
      },
    );
  });

  testWidgets('without a stored token the app opens on sign-in, not a tab', (
    tester,
  ) async {
    final app = TestApp();
    await app.pump(tester);

    expect(_signInScreen, findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text(_sessionEnded), findsNothing);
    expect(app.session, isA<SignedOut>());

    // A tab asked for by address is refused too.
    app.container.read(routerProvider).go('/more');
    await tester.pumpAndSettle();
    expect(_signInScreen, findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('a stored token opens the tabs and asks the server who it is', (
    tester,
  ) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    final app = TestApp(token: 'stored-token', api: api);
    await app.pump(tester);

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(_signInScreen, findsNothing);
    expect(
      api.calls.where((call) => call.path.endsWith('.me')).map((c) => c.token),
      everyElement('stored-token'),
    );
    final session = app.session as SignedIn;
    expect(session.user?.name, 'منى');
    expect(session.user?.kind, AccountKind.phone);
  });

  testWidgets('a Google session is read from auth.me', (tester) async {
    final api = FakeApi()..answer('auth.me', (_) => googleUser());
    final app = TestApp(token: 'stored-token', api: api);
    await app.pump(tester);

    final session = app.session as SignedIn;
    expect(session.user?.kind, AccountKind.google);
    expect(session.user?.email, 'sara@example.com');
    expect(session.user?.plan, 'pro');
  });

  testWidgets('a token the server resolves to nobody ends the session', (
    tester,
  ) async {
    final app = TestApp(token: 'revoked-token');
    await app.pump(tester);

    expect(_signInScreen, findsOneWidget);
    expect(find.text(_sessionEnded), findsOneWidget);
    expect(app.store.token, isNull);
  });

  testWidgets('without a network the stored token still opens the tabs', (
    tester,
  ) async {
    final api = FakeApi()
      ..answer('auth.me', (_) => throw http.ClientException('offline'))
      ..answer('localAuth.me', (_) => throw http.ClientException('offline'));
    final app = TestApp(token: 'stored-token', api: api);
    await app.pump(tester);

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(app.store.token, 'stored-token');
    expect((app.session as SignedIn).user, isNull);
  });

  testWidgets('a call the server refuses as unauthorized clears the token', (
    tester,
  ) async {
    final api = FakeApi()
      ..answer('localAuth.me', (_) => phoneUser())
      ..answer(
        'expense.list',
        (_) => throw const TrpcFailure(
          'UNAUTHORIZED',
          401,
          'يجب تسجيل الدخول أولاً',
        ),
      );
    final app = TestApp(token: 'stored-token', api: api);
    await app.pump(tester);
    expect(find.byType(NavigationBar), findsOneWidget);

    await expectLater(
      app.container
          .read(trpcClientProvider)
          .query(Procedures.expense.list, input: {}),
      throwsA(isA<ApiException>()),
    );
    await tester.pumpAndSettle();

    expect(app.store.token, isNull);
    expect(_signInScreen, findsOneWidget);
    expect(find.text(_sessionEnded), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('other errors leave the session alone', (tester) async {
    final api = FakeApi()
      ..answer('localAuth.me', (_) => phoneUser())
      ..answer(
        'expense.list',
        (_) => throw const TrpcFailure(
          'INTERNAL_SERVER_ERROR',
          500,
          'حصلت مشكلة عندنا. جرّب تاني.',
        ),
      );
    final app = TestApp(token: 'stored-token', api: api);
    await app.pump(tester);

    await expectLater(
      app.container
          .read(trpcClientProvider)
          .query(Procedures.expense.list, input: {}),
      throwsA(isA<ApiException>()),
    );
    await tester.pumpAndSettle();

    expect(app.store.token, 'stored-token');
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
