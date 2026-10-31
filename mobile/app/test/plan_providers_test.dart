import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/plans/plan_providers.dart';

import 'support/test_app.dart';

void main() {
  testWidgets('reads user plan and resolves isPro correctly', (tester) async {
    final api = FakeApi();
    api.answer('pro.myPlan', (_) => {
      'plan': 'pro',
      'role': 'user',
      'features': {
        'receipts': true,
        'business': true,
        'ads': false,
      },
    });

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
    api.answer('pro.myPlan', (_) => {
      'plan': 'free',
      'role': 'user',
      'features': {
        'receipts': false,
        'business': false,
        'ads': true,
      },
    });

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
    api.answer('pro.planCatalog', (_) => {
      'pro': [
        {'key': 'voice', 'label': 'التسجيل الصوتي', 'value': 'بدون حد'},
        {'key': 'receipts', 'label': 'تصوير الفواتير', 'value': true},
      ],
    });

    final app = TestApp(token: 'token', api: api);
    await app.pump(tester);

    final catalog = await app.container.read(planCatalogProvider.future);
    expect(catalog.containsKey('pro'), true);
    expect(catalog['pro']!.first.label, 'التسجيل الصوتي');
    expect(catalog['pro']!.first.value, 'بدون حد');
  });
}
