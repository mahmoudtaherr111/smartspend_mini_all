import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/limits/limits_card.dart';
import 'package:smartspend_app/src/features/limits/limits_models.dart';
import 'package:smartspend_app/src/features/more/more_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

void main() {
  group('Limits I can see (REC-16)', () {
    test('UserLimits model parses json correctly', () {
      final limits = UserLimits.fromJson({
        'ai': {
          'limit': 20,
          'used': 18,
          'remaining': 2,
          'maxPerRequest': 1,
        },
        'voice': {
          'limit': 300,
          'used': 260,
          'remaining': 40,
          'maxPerRequest': 60,
        },
        'offline': {
          'limit': 50,
        },
      });

      expect(limits.ai.limit, 20);
      expect(limits.ai.remaining, 2);
      expect(limits.ai.isLow, true);
      expect(limits.voice.remaining, 40);
      expect(limits.voice.isLow, true);
      expect(limits.offlineLimit, 50);
    });

    testWidgets('LimitsCard displays remaining voice and AI and prompts upgrade when low', (tester) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer('ai.getUserLimits', (_) => {
        'ai': {
          'limit': 20,
          'used': 18,
          'remaining': 2,
          'maxPerRequest': 1,
        },
        'voice': {
          'limit': 300,
          'used': 270,
          'remaining': 30,
          'maxPerRequest': 60,
        },
        'offline': {
          'limit': 50,
        },
      });

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(MoreScreen.path);
      await tester.pumpAndSettle();

      expect(find.byType(LimitsCard), findsOneWidget);
      expect(find.text('استهلاك باقتك الشهرية'), findsOneWidget);
      expect(find.text('قربت تخلّص'), findsOneWidget);
      expect(find.text('باقي 30 ثانية من أصل 300'), findsOneWidget);
      expect(find.text('باقي 2 عملية من أصل 20'), findsOneWidget);
      expect(find.widgetWithText(SmartSpendButton, 'ترقية باقتك إلى Pro'), findsOneWidget);
    });
  });
}
