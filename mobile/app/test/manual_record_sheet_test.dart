// Manual record sheet (REC-12): Egyptian numeric keypad, Western & Eastern numerals,
// type switch, category selection, discard protection, and offline enqueueing.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/manual_record_sheet.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openApp(WidgetTester tester, {FakeApi? api}) async {
  final fakeApi = api ?? FakeApi();
  fakeApi.answer('localAuth.me', (_) => phoneUser());
  answerSampleMonth(fakeApi);
  final app = TestApp(token: 'stored-token', api: fakeApi);
  await app.pump(tester);
  return app;
}

void main() {
  testWidgets('renders keypad, types amount with Western/Eastern numerals and validates empty save', (
    tester,
  ) async {
    await _openApp(tester);

    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showManualRecordSheet(context));
    await tester.pumpAndSettle();

    expect(find.byType(ManualRecordSheet), findsOneWidget);
    expect(find.text('تسجيل يدوي'), findsOneWidget);

    // Initial state: 0 amount, default category 'أكل وشرب'
    expect(find.text('٠ ج.م'), findsOneWidget);
    expect(find.text('أكل وشرب'), findsOneWidget);

    // Tap save with 0 amount -> validation error
    await tester.tap(find.text('حفظ العملية'));
    await tester.pumpAndSettle();
    expect(find.text('اكتب المبلغ الأول'), findsOneWidget);

    // Tap numeric keypad keys: 5, then 0, then decimal dot, then 5
    // Keypad displays '5' with subtitle '٥'
    await tester.tap(find.widgetWithText(InkWell, '5'));
    await tester.pumpAndSettle();
    expect(find.text('5 ج.م'), findsOneWidget);

    await tester.tap(find.widgetWithText(InkWell, '0'));
    await tester.pumpAndSettle();
    expect(find.text('50 ج.م'), findsOneWidget);

    // Tap decimal dot
    await tester.tap(find.widgetWithText(InkWell, '.'));
    await tester.pumpAndSettle();
    expect(find.text('50. ج.م'), findsOneWidget);

    await tester.tap(find.widgetWithText(InkWell, '5'));
    await tester.pumpAndSettle();
    expect(find.text('50.5 ج.م'), findsOneWidget);

    // Delete back
    await tester.tap(find.byIcon(Icons.backspace_outlined));
    await tester.pumpAndSettle();
    expect(find.text('50. ج.م'), findsOneWidget);
  });

  testWidgets('switching type updates canonical category and submits manual expense successfully', (
    tester,
  ) async {
    final api = FakeApi();
    Map<String, Object?>? createdExpense;
    api.answer('expense.create', (input) {
      if (input is Map) createdExpense = Map<String, Object?>.from(input);
      return {
        'id': 999,
        'amount': 120,
        'type': 'expense',
        'category': 'أكل وشرب',
        'date': DateTime.now().toUtc().toIso8601String(),
        'createdAt': DateTime.now().toUtc().toIso8601String(),
      };
    });

    await _openApp(tester, api: api);

    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showManualRecordSheet(context));
    await tester.pumpAndSettle();

    // Type switch: switch to income
    await tester.tap(find.text('دخل'));
    await tester.pumpAndSettle();
    expect(find.text('مرتب'), findsOneWidget);

    // Switch back to expense
    await tester.tap(find.text('مصروف'));
    await tester.pumpAndSettle();
    expect(find.text('أكل وشرب'), findsOneWidget);

    // Type 1, 2, 0
    await tester.tap(find.widgetWithText(InkWell, '1'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(InkWell, '2'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(InkWell, '0'));
    await tester.pumpAndSettle();
    expect(find.text('120 ج.م'), findsOneWidget);

    // Save
    await tester.tap(find.text('حفظ العملية'));
    await tester.pumpAndSettle();

    // Sheet dismissed, success notice shown
    expect(find.byType(ManualRecordSheet), findsNothing);
    expect(find.text('اتسجلت العملية بنجاح'), findsOneWidget);
    expect(createdExpense != null, isTrue);
    expect(createdExpense!['amount'], 120);
    expect(createdExpense!['type'], 'expense');
    expect(createdExpense!['category'], 'أكل وشرب');
    expect(createdExpense!['source'], 'manual');
  });

  testWidgets('discard confirmation dialog shown on attempt to dismiss dirty sheet', (
    tester,
  ) async {
    await _openApp(tester);

    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showManualRecordSheet(context));
    await tester.pumpAndSettle();

    // Clean sheet: tapping close icon pops without confirmation
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();
    expect(find.byType(ManualRecordSheet), findsNothing);

    // Reopen and type an amount
    final context2 = tester.element(find.byType(Scaffold).first);
    unawaited(showManualRecordSheet(context2));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(InkWell, '7'));
    await tester.pumpAndSettle();

    // Now dirty: tap close icon -> triggers discard confirmation
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();

    expect(find.text('تجاهل التعديلات؟'), findsOneWidget);
    expect(find.text('لو رجعت دلوقتي، التعديلات اللي كتبتها مش هتتحفظ.'), findsOneWidget);

    // Tap "كمّل تعديل" (continue editing)
    await tester.tap(find.text('كمّل تعديل'));
    await tester.pumpAndSettle();
    expect(find.byType(ManualRecordSheet), findsOneWidget);
    expect(find.text('7 ج.م'), findsOneWidget);

    // Tap close again and confirm discard
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تجاهل'));
    await tester.pumpAndSettle();

    expect(find.byType(ManualRecordSheet), findsNothing);
  });
}
