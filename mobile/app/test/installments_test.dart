import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/installments/installment_form_sheet.dart';
import 'package:smartspend_app/src/features/installments/installment_models.dart';
import 'package:smartspend_app/src/features/installments/installments_quick_card.dart';
import 'package:smartspend_app/src/features/installments/installments_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

void main() {
  group('InstallmentPlan model', () {
    test('parses json and computes progress correctly', () {
      final plan = InstallmentPlan.fromJson({
        'id': 1,
        'title': 'موبايل فاليو',
        'keyword': 'فاليو',
        'monthlyAmount': 850.0,
        'totalInstallments': 12,
        'paid': 4,
        'remaining': 8,
        'remainingAmount': 6800.0,
        'done': false,
        'countedBy': 'keyword',
      });

      expect(plan.id, 1);
      expect(plan.title, 'موبايل فاليو');
      expect(plan.keyword, 'فاليو');
      expect(plan.monthlyAmount, 850.0);
      expect(plan.totalInstallments, 12);
      expect(plan.paid, 4);
      expect(plan.remaining, 8);
      expect(plan.remainingAmount, 6800.0);
      expect(plan.done, false);
      expect(plan.isAmbiguous, false);
      expect(plan.progressFraction, closeTo(4 / 12, 0.001));
    });

    test('handles ambiguous count tag', () {
      final plan = InstallmentPlan.fromJson({
        'id': 2,
        'title': 'قسط أمان',
        'keyword': 'أمان',
        'monthlyAmount': 500,
        'totalInstallments': 6,
        'paid': 0,
        'remaining': 6,
        'remainingAmount': 3000,
        'done': false,
        'countedBy': 'ambiguous',
      });

      expect(plan.isAmbiguous, true);
    });
  });

  group('InstallmentsScreen (REC-18)', () {
    testWidgets('shows empty state when no plans exist', (tester) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'expense.listInstallmentPlans',
        (_) => <Map<String, Object?>>[],
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(InstallmentsScreen.path);
      await tester.pumpAndSettle();

      expect(find.text('مافيش أقساط متسجلة'), findsOneWidget);
      expect(find.text('إضافة أول قسط'), findsOneWidget);
    });

    testWidgets('displays active plans and hero monthly burden', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'expense.listInstallmentPlans',
        (_) => [
          {
            'id': 1,
            'title': 'قسط تكييف شارب',
            'keyword': 'شارب',
            'monthlyAmount': 1200.0,
            'totalInstallments': 10,
            'paid': 3,
            'remaining': 7,
            'remainingAmount': 8400.0,
            'done': false,
            'countedBy': 'keyword',
          },
          {
            'id': 2,
            'title': 'موبايل فاليو',
            'keyword': 'فاليو',
            'monthlyAmount': 800.0,
            'totalInstallments': 6,
            'paid': 6,
            'remaining': 0,
            'remainingAmount': 0.0,
            'done': true,
            'countedBy': 'keyword',
          },
        ],
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(InstallmentsScreen.path);
      await tester.pumpAndSettle();

      expect(find.text('إجمالي الأقساط الشهرية'), findsOneWidget);
      expect(find.text('قسط تكييف شارب'), findsOneWidget);
      expect(find.text('الأقساط المكتملة (1)'), findsOneWidget);
      expect(find.text('موبايل فاليو'), findsOneWidget);
    });

    testWidgets('validates inputs and creates plan in InstallmentFormSheet', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'expense.listInstallmentPlans',
        (_) => <Map<String, Object?>>[],
      );

      Map<String, Object?>? createdInput;
      api.answer('expense.createInstallmentPlan', (input) {
        createdInput = input as Map<String, Object?>?;
        return {'success': true};
      });

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(InstallmentsScreen.path);
      await tester.pumpAndSettle();

      await tester.tap(find.text('إضافة أول قسط'));
      await tester.pumpAndSettle();

      expect(find.byType(InstallmentFormSheet), findsOneWidget);

      // Tap save without filling: shows error
      await tester.tap(find.text('حفظ القسط'));
      await tester.pumpAndSettle();
      expect(find.text('اكتب اسم القسط (حرفين على الأقل)'), findsOneWidget);

      // Fill title
      await tester.enterText(
        find.widgetWithText(TextField, 'اسم القسط *'),
        'قسط لاب توب',
      );
      // Fill amount
      await tester.enterText(
        find.widgetWithText(TextField, 'القسط كام في الشهر (ج.م) *'),
        '1500',
      );
      // Fill total
      await tester.enterText(
        find.widgetWithText(TextField, 'إجمالي الأقساط *'),
        '12',
      );
      await tester.pumpAndSettle();

      await tester.ensureVisible(
        find.widgetWithText(SmartSpendButton, 'حفظ القسط'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(SmartSpendButton, 'حفظ القسط'));
      await tester.pumpAndSettle();

      expect(createdInput, isNotNull);
      expect(createdInput!['title'], 'قسط لاب توب');
      expect(createdInput!['monthlyAmount'], 1500.0);
      expect(createdInput!['totalInstallments'], 12);
    });

    testWidgets(
      'InstallmentsQuickCard shows active count and links to screen',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'expense.listInstallmentPlans',
          (_) => [
            {
              'id': 1,
              'title': 'قسط بي تك',
              'keyword': 'بي تك',
              'monthlyAmount': 600.0,
              'totalInstallments': 12,
              'paid': 2,
              'remaining': 10,
              'remainingAmount': 6000.0,
              'done': false,
              'countedBy': 'keyword',
            },
          ],
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        // Pump on record screen
        await tester.pumpAndSettle();

        expect(find.byType(InstallmentsQuickCard), findsOneWidget);
        expect(find.text('الأقساط (1)'), findsOneWidget);
        expect(find.text('قسط بي تك: فاضل 10 من أصل 12 قسط'), findsOneWidget);
      },
    );
  });
}
