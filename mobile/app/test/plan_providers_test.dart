import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/plans/plan_providers.dart';
import 'package:smartspend_app/src/features/plans/plan_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';

import 'support/test_app.dart';

void main() {
  testWidgets('reads user plan and resolves isPro correctly', (tester) async {
    final api = FakeApi();
    api.answer(
      'pro.myPlan',
      (_) => {
        'plan': 'pro',
        'role': 'user',
        'features': {'receipts': true, 'business': true, 'ads': false},
      },
    );

    final app = TestApp(token: 'token-pro', api: api);
    await app.pump(tester);

    final plan = await app.container.read(userPlanProvider.future);
    expect(plan.plan, 'pro');
    expect(plan.isPro, true);
    expect(plan.receiptsEnabled, true);
    expect(app.container.read(isProUserProvider), true);
  });

  testWidgets('free user is not pro and has free features', (tester) async {
    final api = FakeApi();
    api.answer(
      'pro.myPlan',
      (_) => {
        'plan': 'free',
        'role': 'user',
        'features': {'receipts': false, 'business': false, 'ads': true},
      },
    );

    final app = TestApp(token: 'token-free', api: api);
    await app.pump(tester);

    final plan = await app.container.read(userPlanProvider.future);
    expect(plan.plan, 'free');
    expect(plan.isPro, false);
    expect(plan.receiptsEnabled, false);
    expect(app.container.read(isProUserProvider), false);
  });

  testWidgets('reads planCatalog correctly', (tester) async {
    final api = FakeApi();
    api.answer(
      'pro.planCatalog',
      (_) => {
        'pro': [
          {'key': 'voice', 'label': 'التسجيل الصوتي', 'value': 'بدون حد'},
          {'key': 'receipts', 'label': 'تصوير الفواتير', 'value': true},
        ],
      },
    );

    final app = TestApp(token: 'token', api: api);
    await app.pump(tester);

    final catalog = await app.container.read(planCatalogProvider.future);
    expect(catalog.containsKey('pro'), true);
    expect(catalog['pro']!.first.label, 'التسجيل الصوتي');
    expect(catalog['pro']!.first.value, 'بدون حد');
  });

  testWidgets('ultra user resolves isPro and isUltra', (tester) async {
    final api = FakeApi();
    api.answer(
      'pro.myPlan',
      (_) => {
        'plan': 'ultra',
        'role': 'user',
        'features': {
          'receipts': true,
          'business': true,
          'proReport': true,
          'goalAnalysis': true,
          'ads': false,
        },
      },
    );

    final app = TestApp(token: 'token-ultra', api: api);
    await app.pump(tester);

    final plan = await app.container.read(userPlanProvider.future);
    expect(plan.plan, 'ultra');
    expect(plan.isPro, true);
    expect(plan.isUltra, true);
    expect(plan.adsEnabled, false);
  });

  testWidgets('free user obeys admin-configured limits and feature switches', (
    tester,
  ) async {
    final api = FakeApi();
    api.answer(
      'pro.myPlan',
      (_) => {
        'plan': 'free',
        'role': 'user',
        'features': {
          'receipts': true,
          'business': false,
          'goalAnalysis': true,
          'ads': false,
        },
        'limits': {
          'goalsActiveLimit': 5,
          'commitmentsActiveLimit': 10,
          'offlineLimit': 15,
        },
      },
    );

    final app = TestApp(token: 'token-trial', api: api);
    await app.pump(tester);

    final plan = await app.container.read(userPlanProvider.future);
    expect(plan.isPro, false);
    expect(plan.receiptsEnabled, true);
    expect(plan.goalAnalysisEnabled, true);
    expect(plan.adsEnabled, false);
    expect(plan.goalsActiveLimit, 5);
    expect(plan.commitmentsActiveLimit, 10);
    expect(plan.offlineLimit, 15);
  });

  testWidgets(
    'PlanScreen renders store-only billing without Paymob and shows dynamic catalog',
    (tester) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'pro.myPlan',
        (_) => {
          'plan': 'free',
          'role': 'user',
          'features': {'receipts': false, 'ads': true},
        },
      );
      api.answer(
        'pro.planCatalog',
        (_) => {
          'pro': [
            {
              'key': 'daily_entries',
              'label': 'تسجيل ذكي بالكلام',
              'value': '100 في اليوم',
            },
            {'key': 'no_ads', 'label': 'بدون إعلانات', 'value': true},
          ],
        },
      );
      api.answer(
        'pro.storeBilling',
        (_) => {
          'googlePlay': false,
          'appStore': false,
          'productIds': ['pro_monthly', 'pro_yearly', 'ultra_monthly'],
          'accountToken': '00000000-0000-4000-8000-000000000000',
        },
      );

      final app = TestApp(token: 'token-plan-screen', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(PlanScreen.path);
      await tester.pumpAndSettle();

      expect(find.text('تسجيل ذكي بالكلام: 100 في اليوم'), findsOneWidget);
      expect(find.text('بدون إعلانات'), findsOneWidget);
      expect(find.textContaining('Paymob'), findsNothing);
    },
  );
}
