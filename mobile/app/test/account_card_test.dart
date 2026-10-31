// Sign-out and secure wipe (AUTH-06): account display, clean sign-out with empty outbox,
// warning confirmation sheet when outbox has pending items, and wiping local ledger and lock.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/lock/app_lock.dart';
import 'package:smartspend_app/src/features/more/account_card.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openApp(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  answerSampleMonth(api);
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  return app;
}

Future<void> _send(WidgetTester tester, String sentence) async {
  await tester.enterText(find.byType(TextField).first, sentence);
  await tester.tap(find.byTooltip('ابعت'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('renders account details for signed-in user', (tester) async {
    final api = FakeApi();
    await _openApp(tester, api);

    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();

    expect(find.byType(AccountCard), findsOneWidget);
    expect(find.text('منى'), findsOneWidget);
    expect(find.text(inlineName('01012345678')), findsOneWidget);
    expect(find.text('تسجيل الخروج'), findsOneWidget);
  });

  testWidgets(
    'signing out with empty outbox proceeds immediately and wipes local stores',
    (tester) async {
      final api = FakeApi();
      var loggedOutOnServer = false;
      api.answer('localAuth.logout', (_) {
        loggedOutOnServer = true;
        return {'success': true};
      });

      final app = await _openApp(tester, api);

      // Turn on app lock
      await app.container.read(appLockProvider.notifier).setPin('482915');

      // Populate local ledger
      await app.container
          .read(localLedgerProvider)
          .update((l) => l.copyWith(summaryMonth: '2026-10'));

      // Verify initial state has data
      expect(app.store.token, 'stored-token');
      expect(app.lockStore.record.enabled, isTrue);
      expect(app.ledgerStore.ledger.summaryMonth, '2026-10');

      // Navigate to More screen
      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();

      // Tap sign-out
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();

      // Verified server logout was called
      expect(loggedOutOnServer, isTrue);

      // No warning sheet appeared
      expect(find.text('اخرج على أي حال'), findsNothing);

      // Token is removed
      expect(app.store.token, isNull);
      expect(app.session, isA<SignedOut>());

      // Local ledger is wiped
      final storedSnapshot = await app.container
          .read(localLedgerProvider)
          .snapshot();
      expect(storedSnapshot.accountKey, isNull);
      expect(storedSnapshot.outbox, isEmpty);
      expect(app.ledgerStore.ledger.summaryMonth, isNull);

      // App lock is wiped
      expect(app.lockStore.record.enabled, isFalse);
      expect(app.lockStore.record.pinTag, isNull);

      // Back on sign-in screen
      expect(find.widgetWithText(TextField, 'رقم التليفون'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'ادخل'), findsOneWidget);
    },
  );

  testWidgets(
    'signing out with pending outbox warns user, stays on cancel, wipes on confirm',
    (tester) async {
      final api = FakeApi();
      final app = await _openApp(tester, api);

      // Turn on app lock
      await app.container.read(appLockProvider.notifier).setPin('482915');

      // Make offline and send a transaction so it queues in the outbox
      api.offline = true;
      await _send(tester, 'قهوة 50');

      expect(app.ledgerStore.ledger.outbox, hasLength(1));

      // Navigate to More screen
      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();

      // Tap sign-out
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();

      // Warning sheet appears
      expect(
        find.text(
          'عندك عملية واحدة متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هتروح.',
        ),
        findsOneWidget,
      );
      expect(find.text('اخرج على أي حال'), findsOneWidget);
      expect(find.text('استنى'), findsOneWidget);

      // 1. User cancels
      await tester.tap(find.text('استنى'));
      await tester.pumpAndSettle();

      // Sheet dismissed, user still signed in, data untouched
      expect(find.text('اخرج على أي حال'), findsNothing);
      expect(app.store.token, 'stored-token');
      expect(app.session, isA<SignedIn>());
      expect(app.lockStore.record.enabled, isTrue);
      expect(app.ledgerStore.ledger.outbox, hasLength(1));

      // 2. User taps sign-out again and confirms
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('اخرج على أي حال'));
      await tester.pumpAndSettle();

      // Signed out and stores wiped
      expect(app.store.token, isNull);
      expect(app.session, isA<SignedOut>());
      expect(app.ledgerStore.ledger.outbox, isEmpty);
      expect(app.lockStore.record.enabled, isFalse);

      // Back on sign-in screen
      expect(find.widgetWithText(TextField, 'رقم التليفون'), findsOneWidget);
    },
  );
}
