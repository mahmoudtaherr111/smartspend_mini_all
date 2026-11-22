import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/core/preferences.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_app/src/features/auth/starting_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';

import 'support/test_app.dart';

void main() {
  testWidgets('StartingScreen uses dark #090D16 splash background', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: StartingScreen()));
    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.backgroundColor, const Color(0xFF090D16));
  });

  testWidgets('SmartSpendApp rebuilds on theme/locale change without errors', (
    tester,
  ) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    final app = TestApp(token: 'session-token', api: api);
    await app.pump(tester);

    expect(app.session, isA<SignedIn>());

    await app.container
        .read(languageProvider.notifier)
        .choose(AppLanguage.english);
    await tester.pumpAndSettle();

    expect(find.text('More'), findsWidgets);
  });

  testWidgets('router redirects /more/commitments to /commitments', (
    tester,
  ) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    final app = TestApp(token: 'session-token', api: api);
    await app.pump(tester);

    final router = app.container.read(routerProvider);
    router.go('/more/commitments');
    await tester.pumpAndSettle();

    expect(router.routerDelegate.currentConfiguration.uri.path, '/commitments');
  });
}
