// Edit transaction sheet (REC-07): amount validation, Cairo noon UTC date handling,
// field error presentation, offline prohibition, and optimistic refresh.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/edit_transaction_sheet.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openAppWithSample(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  return app;
}

LedgerEntry _sampleEntry({
  int id = 9,
  num amount = 185,
  String category = 'أكل وشرب',
  int? walletId = 1,
  int? contactId = 11,
}) => LedgerEntry(
  id: id,
  amount: amount,
  type: 'expense',
  category: category,
  subCategory: 'دليفري',
  description: 'Talabat',
  rawText: 'طلبت عشاء من طلبات مع أحمد بـ 185 من كارت CIB',
  source: 'ai_parsed',
  walletId: walletId,
  contactId: contactId,
  date: DateTime.utc(2026, 10, 19, 14, 20),
);

Future<void> _tapSave(WidgetTester tester) async {
  await tester.ensureVisible(find.text('احفظ التعديل'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('احفظ التعديل'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('renders initial values and validates amount before saving', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    await _openAppWithSample(tester, api);

    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showEditTransactionSheet(context, entry: _sampleEntry()));
    await tester.pumpAndSettle();

    expect(find.byType(BottomSheet), findsOneWidget);
    expect(find.text('تعديل العملية'), findsOneWidget);

    // Initial amount populated
    expect(find.text('185'), findsOneWidget);
    // Initial note populated
    expect(find.text('Talabat'), findsOneWidget);

    // Enter invalid amount (0)
    await tester.enterText(find.widgetWithText(TextField, 'المبلغ'), '0');
    await _tapSave(tester);

    // Inline error shown
    expect(
      find.text('اكتب مبلغ أكبر من صفر، زي 150 أو 150.50.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'saving changes without date change omits date in mutation payload',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      Map<String, Object?>? updateInput;
      api.answer('expense.update', (input) {
        if (input is Map) updateInput = Map<String, Object?>.from(input);
        return {'success': true};
      });

      await _openAppWithSample(tester, api);

      final context = tester.element(find.byType(Scaffold).first);
      unawaited(showEditTransactionSheet(context, entry: _sampleEntry()));
      await tester.pumpAndSettle();

      // Change amount to 220
      await tester.enterText(find.widgetWithText(TextField, 'المبلغ'), '220');
      // Change note to McDonald's
      await tester.enterText(
        find.widgetWithText(TextField, 'ملاحظة'),
        'McDonalds',
      );

      await _tapSave(tester);

      expect(updateInput, isNotNull);
      expect(updateInput!['id'], 9);
      expect(updateInput!['amount'], 220);
      expect(updateInput!['description'], 'McDonalds');
      // Date was not changed, so date key is omitted from update
      expect(updateInput!.containsKey('date'), isFalse);

      // Sheet dismissed
      expect(find.text('تعديل العملية'), findsNothing);
    },
  );

  testWidgets('handles server validation errors cleanly without wiping input', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer(
      'expense.update',
      (_) => throw const TrpcFailure(
        'BAD_REQUEST',
        400,
        'التصنيف غير مسموح لهذه العملية',
      ),
    );

    await _openAppWithSample(tester, api);

    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showEditTransactionSheet(context, entry: _sampleEntry()));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'المبلغ'), '250');
    await _tapSave(tester);

    // Error message is displayed inline
    expect(find.text('التصنيف غير مسموح لهذه العملية'), findsOneWidget);
    // User input is preserved
    expect(find.text('250'), findsOneWidget);
    // Sheet remains open
    expect(find.text('تعديل العملية'), findsOneWidget);
  });

  testWidgets('offline status displays notice and disables save button', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    final app = await _openAppWithSample(tester, api);

    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showEditTransactionSheet(context, entry: _sampleEntry()));
    await tester.pumpAndSettle();

    // Set offline
    app.container.read(networkStatusProvider.notifier).unreachable();
    await tester.pumpAndSettle();

    expect(find.text('وصّل النت عشان تعدّل العملية.'), findsOneWidget);

    final saveButton = tester.widget<SmartSpendButton>(
      find.widgetWithText(SmartSpendButton, 'احفظ التعديل'),
    );
    expect(saveButton.onPressed, isNull);
  });

  testWidgets(
    'displays localized unknown fallback instead of raw #id when wallet or contact is missing',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openAppWithSample(tester, api);

      final entry = _sampleEntry(walletId: 9999, contactId: 8888);
      final context = tester.element(find.byType(Scaffold).first);
      unawaited(showEditTransactionSheet(context, entry: entry));
      await tester.pumpAndSettle();

      // Unknown wallet and contact localized text is shown, not raw '#9999' or '#8888'
      expect(find.text('#9999'), findsNothing);
      expect(find.text('#8888'), findsNothing);
      expect(find.text('محفظة غير معروفة'), findsOneWidget);
      expect(find.text('شخص غير معروف'), findsOneWidget);
    },
  );

  testWidgets(
    'dirty edit sheet prompts confirmation on dismissal to protect against accidental edit loss',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openAppWithSample(tester, api);

      final context = tester.element(find.byType(Scaffold).first);
      unawaited(showEditTransactionSheet(context, entry: _sampleEntry()));
      await tester.pumpAndSettle();

      expect(find.text('تعديل العملية'), findsOneWidget);

      // Change amount to make it dirty
      await tester.enterText(find.widgetWithText(TextField, 'المبلغ'), '350');
      await tester.pumpAndSettle();

      // Trigger pop via cancel button ('رجوع')
      await tester.ensureVisible(find.text('رجوع'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('رجوع'));
      await tester.pumpAndSettle();

      // Confirmation dialog is shown
      expect(find.text('تجاهل التعديلات؟'), findsOneWidget);
      expect(
        find.text('لو رجعت دلوقتي، التعديلات اللي كتبتها مش هتتحفظ.'),
        findsOneWidget,
      );

      // Cancel discard (continue editing)
      await tester.tap(find.text('كمّل تعديل'));
      await tester.pumpAndSettle();

      // Dialog is gone, sheet is still open with changes preserved
      expect(find.text('تجاهل التعديلات؟'), findsNothing);
      expect(find.text('تعديل العملية'), findsOneWidget);
      expect(find.text('350'), findsOneWidget);

      // Trigger pop again and confirm discard
      await tester.ensureVisible(find.text('رجوع'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('رجوع'));
      await tester.pumpAndSettle();
      expect(find.text('تجاهل التعديلات؟'), findsOneWidget);

      await tester.tap(find.text('تجاهل'));
      await tester.pumpAndSettle();

      // Sheet is closed
      expect(find.text('تعديل العملية'), findsNothing);
    },
  );
}
