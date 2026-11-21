import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/budgets/budget_form_sheet.dart';
import 'package:smartspend_app/src/features/budgets/budgets_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

void main() {
  group('Budgets (MON-06)', () {
    testWidgets('BudgetsScreen displays empty state when user has no budgets', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer('budget.list', (_) => {'budgets': <Map<String, Object?>>[]});

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(BudgetsScreen.path);
      await tester.pumpAndSettle();

      expect(find.text('الميزانيات الشهرية'), findsOneWidget);
      expect(find.text('لسه مفيش ميزانيات'), findsOneWidget);
      expect(find.text('ضيف ميزانية شهرية'), findsOneWidget);
    });

    testWidgets(
      'BudgetsScreen displays hero summary and budget cards with warning badges',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'budget.list',
          (_) => {
            'budgets': [
              {
                'id': 1,
                'title': 'الميزانية العامة',
                'category': null,
                'monthlyLimit': 10000,
                'periodStartDay': 1,
                'currentSpent': 8500,
                'percentage': 85,
                'isExceeded': false,
                'isNearLimit': true,
              },
              {
                'id': 2,
                'title': 'أكل وشرب',
                'category': 'أكل وشرب',
                'monthlyLimit': 3000,
                'periodStartDay': 1,
                'currentSpent': 3500,
                'percentage': 117,
                'isExceeded': true,
                'isNearLimit': true,
              },
              {
                'id': 3,
                'title': 'مواصلات',
                'category': 'مواصلات',
                'monthlyLimit': 2000,
                'periodStartDay': 1,
                'currentSpent': 800,
                'percentage': 40,
                'isExceeded': false,
                'isNearLimit': false,
              },
            ],
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(BudgetsScreen.path);
        await tester.pumpAndSettle();

        // Check hero card
        expect(find.text('الميزانية العامة'), findsWidgets);
        expect(find.text('85%'), findsOneWidget);
        expect(find.text('صرفت: 8,500 ج.م'), findsOneWidget);
        expect(find.text('فاضل: 1,500 ج.م'), findsOneWidget);

        // Check category cards and badges
        expect(find.text('أكل وشرب'), findsWidgets);
        expect(find.textContaining('زدت عن الميزانية (117%)'), findsOneWidget);

        expect(find.text('مواصلات'), findsWidgets);
        expect(find.text('فاضل: 1,200 ج.م'), findsOneWidget);
      },
    );

    testWidgets('Create budget via BudgetFormSheet invokes budget.create', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer('budget.list', (_) => {'budgets': <Map<String, Object?>>[]});

      Map<String, Object?>? createdInput;
      api.answer('budget.create', (input) {
        createdInput = input as Map<String, Object?>?;
        return {'success': true, 'budgetId': 42};
      });

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(BudgetsScreen.path);
      await tester.pumpAndSettle();

      // Tap add budget in empty state
      await tester.tap(find.text('ضيف ميزانية شهرية'));
      await tester.pumpAndSettle();

      expect(find.byType(BudgetFormSheet), findsOneWidget);

      // Enter limit: 4500
      await tester.enterText(find.byType(TextField).last, '4500');
      await tester.pumpAndSettle();

      // Tap submit button
      await tester.tap(find.widgetWithText(SmartSpendButton, 'ضيف الميزانية'));
      await tester.pumpAndSettle();

      expect(createdInput, isNotNull);
      expect(createdInput!['monthlyLimit'], 4500.0);
    });

    testWidgets('Delete budget invokes budget.delete and offers undo', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'budget.list',
        (_) => {
          'budgets': [
            {
              'id': 10,
              'title': 'ميزانية الترفيه',
              'category': 'ترفيه',
              'monthlyLimit': 1500,
              'periodStartDay': 1,
              'currentSpent': 300,
              'percentage': 20,
              'isExceeded': false,
              'isNearLimit': false,
            },
          ],
        },
      );

      int? deletedId;
      api.answer('budget.delete', (input) {
        deletedId = (input as Map<String, Object?>?)?['budgetId'] as int?;
        return {'success': true};
      });

      Map<String, Object?>? restoredInput;
      api.answer('budget.create', (input) {
        restoredInput = input as Map<String, Object?>?;
        return {'success': true, 'budgetId': 11};
      });

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(BudgetsScreen.path);
      await tester.pumpAndSettle();

      // Tap delete icon
      await tester.tap(find.byIcon(Icons.delete_outline_rounded));
      await tester.pumpAndSettle();

      // Confirm in dialog (DEF-25)
      await tester.tap(find.widgetWithText(TextButton, 'امسح'));
      await tester.pumpAndSettle();

      expect(deletedId, 10);
      expect(find.textContaining('اتمسحت'), findsOneWidget);

      // Tap Undo (تراجع)
      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();

      expect(restoredInput, isNotNull);
      expect(restoredInput!['title'], 'ميزانية الترفيه');
    });
  });
}
