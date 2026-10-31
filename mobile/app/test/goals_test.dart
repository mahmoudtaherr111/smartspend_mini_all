import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/goals/goal_detail_sheet.dart';
import 'package:smartspend_app/src/features/goals/goal_form_sheet.dart';
import 'package:smartspend_app/src/features/goals/goals_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

void main() {
  group('Goals & Milestone Celebration (MON-04 / MON-05 / GAP-16)', () {
    testWidgets('GoalsScreen displays empty state when user has no goals', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'goals.list',
        (_) => {'goals': <Map<String, Object?>>[], 'isPro': false},
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(GoalsScreen.path);
      await tester.pumpAndSettle();

      expect(find.text('أهداف التوفير'), findsOneWidget);
      expect(find.text('لسه ما حددتش أي هدف توفير'), findsOneWidget);
      expect(find.text('إنشاء هدف توفير جديد'), findsOneWidget);
    });

    testWidgets(
      'Creating goal enforces required target amount without silent 50k default (GAP-16)',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'goals.list',
          (_) => {'goals': <Map<String, Object?>>[], 'isPro': false},
        );

        Map<String, Object?>? createdArgs;
        api.answer('goals.create', (args) {
          createdArgs = args as Map<String, Object?>?;
          return {'id': 99, 'success': true};
        });

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(GoalsScreen.path);
        await tester.pumpAndSettle();

        await tester.tap(find.text('إنشاء هدف توفير جديد'));
        await tester.pumpAndSettle();

        expect(find.byType(GoalFormSheet), findsOneWidget);

        // Enter title only, leave amount empty
        await tester.enterText(find.byType(TextField).first, 'عمرة شعبان');
        await tester.pumpAndSettle();

        // Submit without amount -> Must show error and not call API!
        await tester.ensureVisible(
          find.widgetWithText(SmartSpendButton, 'إنشاء الهدف'),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(SmartSpendButton, 'إنشاء الهدف'));
        await tester.pumpAndSettle();

        expect(find.text('من فضلك اكتب المبلغ المستهدف للهدف'), findsOneWidget);
        expect(createdArgs, isNull);

        // Now enter valid amount: 35000
        await tester.enterText(find.byType(TextField).at(1), '35000');
        await tester.pumpAndSettle();

        await tester.ensureVisible(
          find.widgetWithText(SmartSpendButton, 'إنشاء الهدف'),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(SmartSpendButton, 'إنشاء الهدف'));
        await tester.pumpAndSettle();

        expect(createdArgs, isNotNull);
        expect(createdArgs!['title'], 'عمرة شعبان');
        expect(createdArgs!['targetAmount'], 35000.0);
      },
    );

    testWidgets(
      'GoalDetailSheet displays saved AI analysis (MON-05 / GAP-16)',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'goals.list',
          (_) => {
            'goals': [
              {
                'id': 101,
                'title': 'شراء لابتوب برمجة',
                'description': 'ماك بوك للعمل الحر',
                'targetAmount': 60000,
                'status': 'active',
                'lastAnalyzedAt': '2026-10-31T10:00:00Z',
                'aiPlan': {
                  'insight': 'تقدر توصل لهدفك خلال 4 شهور لو وفرت 15,000 ج.م شهرياً من مصاريف الترفيه.',
                  'plan': [
                    'تخصيص 500 ج.م أسبوعياً من مصاريف الأكل بالخارج',
                    'تحويل أرباح العمل الحر مباشرة لحساب التوفير',
                  ],
                  'weekly_actions': ['فرملة طلبات التوصيل لمرة واحدة أسبوعياً'],
                  'alerts': ['انتبه لعروض الجمعة البيضاء لتوفير 10% من السعر'],
                },
              },
            ],
            'isPro': true,
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(GoalsScreen.path);
        await tester.pumpAndSettle();

        expect(find.text('شراء لابتوب برمجة'), findsOneWidget);
        expect(find.text('خطة ذكية'), findsOneWidget);

        // Tap on goal card to open details
        await tester.tap(find.text('شراء لابتوب برمجة'));
        await tester.pumpAndSettle();

        expect(find.byType(GoalDetailSheet), findsOneWidget);
        expect(find.text('تحليل الذكاء الاصطناعي للهدف'), findsOneWidget);
        expect(
          find.textContaining('تقدر توصل لهدفك خلال 4 شهور'),
          findsOneWidget,
        );
        expect(find.textContaining('تخصيص 500 ج.م أسبوعياً'), findsOneWidget);
        expect(find.textContaining('فرملة طلبات التوصيل'), findsOneWidget);
      },
    );

    testWidgets(
      'Completing a goal invokes goals.setStatus and triggers MilestoneCelebration',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'goals.list',
          (_) => {
            'goals': [
              {
                'id': 102,
                'title': 'صندوق الطوارئ',
                'targetAmount': 20000,
                'status': 'active',
              },
            ],
            'isPro': false,
          },
        );

        Map<String, Object?>? statusArgs;
        api.answer('goals.setStatus', (args) {
          statusArgs = args as Map<String, Object?>?;
          return {'success': true};
        });

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(GoalsScreen.path);
        await tester.pumpAndSettle();

        await tester.tap(find.text('صندوق الطوارئ'));
        await tester.pumpAndSettle();

        // Tap complete goal button
        await tester.tap(find.text('تم تحقيق الهدف! 🎯'));
        await tester.pumpAndSettle();

        expect(statusArgs, isNotNull);
        expect(statusArgs!['goalId'], 102);
        expect(statusArgs!['status'], 'completed');

        // MilestoneCelebration should be displayed!
        expect(find.byType(MilestoneCelebration), findsOneWidget);
        expect(find.text('ألف مبروك! 🎯'), findsOneWidget);
      },
    );

    testWidgets(
      'Free plan with 3 active goals opens UpgradePromptSheet on add',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'goals.list',
          (_) => {
            'goals': [
              {
                'id': 1,
                'title': 'هدف 1',
                'targetAmount': 5000,
                'status': 'active',
              },
              {
                'id': 2,
                'title': 'هدف 2',
                'targetAmount': 10000,
                'status': 'active',
              },
              {
                'id': 3,
                'title': 'هدف 3',
                'targetAmount': 15000,
                'status': 'active',
              },
            ],
            'isPro': false,
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(GoalsScreen.path);
        await tester.pumpAndSettle();

        // Tap add icon in AppBar
        await tester.tap(find.byIcon(Icons.add_rounded));
        await tester.pumpAndSettle();

        // UpgradePromptSheet should appear because active goals limit is 3 on Free plan
        expect(find.byType(UpgradePromptSheet), findsOneWidget);
      },
    );
  });
}
