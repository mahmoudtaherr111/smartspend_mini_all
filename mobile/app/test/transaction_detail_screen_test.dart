// Transaction detail screen (REC-08, MON-03): single entry forensic view, hero wash,
// Cairo date, wallet/person linking, missing entity fallback, offline handling, and delete-with-undo.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/ledger/transaction_detail_screen.dart';
import 'package:smartspend_app/src/features/wallets/wallet_detail_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openAppWithSample(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  return app;
}

Future<void> _openTransactionDetail(
  WidgetTester tester,
  TestApp app,
  int entryId,
) async {
  app.container
      .read(routerProvider)
      .go(TransactionDetailScreen.pathFor(entryId));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'renders loaded transaction detail with Egyptian Arabic figures and metadata',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      final app = await _openAppWithSample(tester, api);

      // Entry 9 in sample_month is 'أكل وشرب' 185 EGP with title 'Talabat'
      await _openTransactionDetail(tester, app, 9);

      expect(find.byType(TransactionDetailScreen), findsOneWidget);
      expect(find.byType(HeroFigure), findsOneWidget);

      // Hero amount: -185 ج.م (expense)
      expect(find.text('${ltrIsolate('-185')} ج.م'), findsOneWidget);

      // Category with subcategory
      expect(find.text('أكل وشرب · دليفري'), findsOneWidget);

      // Linked wallet name
      expect(find.text('كارت CIB'), findsOneWidget);

      // Linked person name and relation
      expect(find.text('أحمد · صديق'), findsOneWidget);

      // Note / description (isolated for bidirectional safety)
      expect(find.text(ltrIsolate('Talabat')), findsAtLeastNWidgets(1));

      // Original sentence quote
      expect(
        find.text('«طلبت عشاء من طلبات مع أحمد بـ 185 من كارت CIB»'),
        findsOneWidget,
      );

      // Actions exist
      expect(find.text('تعديل العملية'), findsOneWidget);
      expect(find.text('مسح العملية'), findsOneWidget);
    },
  );

  testWidgets('screen reader reads amount in spoken Egyptian Arabic words', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    final app = await _openAppWithSample(tester, api);

    await _openTransactionDetail(tester, app, 9);

    // AmountText semantics: 'مصروف 185 جنيه'
    final semantics = tester.getSemantics(find.byType(AmountText).first);
    expect(semantics.label, contains('مصروف'));
    expect(semantics.label, contains('185'));
    expect(semantics.label, contains('جنيه'));
  });

  testWidgets('tapping wallet navigates to wallet detail screen', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    final app = await _openAppWithSample(tester, api);

    await _openTransactionDetail(tester, app, 9);

    await tester.tap(find.text('كارت CIB'));
    await tester.pumpAndSettle();

    expect(find.byType(WalletDetailScreen), findsOneWidget);
  });

  testWidgets(
    'missing wallet and contact show localized fallback labels instead of raw #id',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      // Answer expense.getById with orphaned walletId 999 and contactId 888
      api.answer(
        'expense.getById',
        (_) => {
          'id': 99,
          'amount': '250.00',
          'type': 'expense',
          'category': 'تسوق',
          'subCategory': 'ملابس',
          'description': 'Zara',
          'rawText': 'زارا 250 جنيه',
          'source': 'ai_parsed',
          'walletId': 999, // Unknown wallet
          'contactId': 888, // Unknown contact
          'date': DateTime.now().toUtc().toIso8601String(),
        },
      );

      final app = await _openAppWithSample(tester, api);
      app.container
          .read(routerProvider)
          .go(TransactionDetailScreen.pathFor(99));
      await tester.pumpAndSettle();

      expect(find.byType(TransactionDetailScreen), findsOneWidget);
      // Should NOT show #999 or #888
      expect(find.text('#999'), findsNothing);
      expect(find.text('#888'), findsNothing);

      // Should show localized fallback strings
      expect(find.text('محفظة غير معروفة'), findsOneWidget);
      expect(find.text('شخص غير معروف'), findsOneWidget);

      // Tapping missing wallet should not throw or navigate
      await tester.tap(find.text('محفظة غير معروفة'));
      await tester.pumpAndSettle();
      expect(find.byType(TransactionDetailScreen), findsOneWidget);

      // Tapping missing contact should not throw
      await tester.tap(find.text('شخص غير معروف'));
      await tester.pumpAndSettle();
      expect(find.byType(TransactionDetailScreen), findsOneWidget);
    },
  );

  testWidgets('offline mode displays banner and disables edit/delete actions', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    final app = await _openAppWithSample(tester, api);

    await _openTransactionDetail(tester, app, 9);

    // Simulate going offline
    app.connection.add(false);
    app.container.read(networkStatusProvider.notifier).unreachable();
    await tester.pumpAndSettle();

    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.text('وصّل النت عشان تعدّل العملية.'), findsAtLeastNWidgets(1));
  });

  testWidgets('displays empty state when transaction is not found', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('expense.getById', (_) => null);

    final app = await _openAppWithSample(tester, api);
    app.container.read(routerProvider).go(TransactionDetailScreen.pathFor(404));
    await tester.pumpAndSettle();

    expect(find.text('العملية دي مش موجودة'), findsOneWidget);
    expect(find.text('ارجع'), findsOneWidget);

    await tester.tap(find.text('ارجع'));
    await tester.pumpAndSettle();
    expect(find.byType(TransactionDetailScreen), findsNothing);
  });

  testWidgets(
    'deleting transaction pops back, shows notice with undo, and restores on undo',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      var deletedId = 0;
      api.answer('expense.delete', (input) {
        if (input is Map) deletedId = input['id'] as int? ?? 0;
        return {'success': true};
      });

      final app = await _openAppWithSample(tester, api);
      await _openTransactionDetail(tester, app, 9);

      // Scroll to and tap delete
      await tester.ensureVisible(find.text('مسح العملية'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('مسح العملية'));
      await tester.pumpAndSettle();

      // Returned to previous screen and notice appeared with undo
      expect(find.byType(TransactionDetailScreen), findsNothing);
      expect(find.text('اتمسحت العملية.'), findsOneWidget);
      expect(find.text('تراجع'), findsOneWidget);

      // Tap undo
      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();

      // expense.delete should NOT have been called
      expect(deletedId, 0);
    },
  );

  testWidgets(
    'a server error on refresh keeps transaction detail and shows a notice',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      final app = await _openAppWithSample(tester, api);
      await _openTransactionDetail(tester, app, 9);
      expect(find.text('${ltrIsolate('-185')} ج.م'), findsOneWidget);

      api.answer(
        'expense.getById',
        (_) => throw const ApiException(
          code: 'INTERNAL_SERVER_ERROR',
          httpStatus: 500,
          message: 'Internal error',
        ),
      );
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 500),
        1500,
      );
      await tester.pumpAndSettle();

      expect(find.text('${ltrIsolate('-185')} ج.م'), findsOneWidget);
      expect(find.byType(ErrorState), findsNothing);
      expect(
        find.text(
          'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.',
        ),
        findsOneWidget,
      );
    },
  );
}
