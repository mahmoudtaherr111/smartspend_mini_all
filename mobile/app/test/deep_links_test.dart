import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/notifications/push_notification_service.dart';

void main() {
  group('resolveAppRoute', () {
    test('maps broken legacy paths to valid GoRouter routes', () {
      expect(resolveAppRoute('/budgets'), '/more/budgets');
      expect(resolveAppRoute('/plan'), '/more/plan');
      expect(resolveAppRoute('/pro'), '/more/plan');
      expect(resolveAppRoute('/settings/security'), '/more/security');
      expect(
        resolveAppRoute('/settings/security?highlight=biometric'),
        '/more/security',
      );
      expect(resolveAppRoute('/settings?tab=passkeys'), '/more/security');
      expect(resolveAppRoute('/wallets'), '/more/wallets');
      expect(resolveAppRoute('/goals'), '/more/goals');
      expect(resolveAppRoute('/settings'), '/more/settings');
      expect(resolveAppRoute('/support'), '/more/help');
      expect(resolveAppRoute('/ai-center'), '/ai');
      expect(resolveAppRoute('/capture'), '/more/capture');
      expect(resolveAppRoute('/more/commitments'), '/commitments');
      expect(resolveAppRoute('/commitments'), '/commitments');
    });

    test('maps legacy web dashboard tab/fragment destinations', () {
      expect(resolveAppRoute('/dashboard?tab=stats#budget'), '/more/budgets');
      expect(resolveAppRoute('/dashboard?tab=stats'), '/stats');
      expect(resolveAppRoute('/dashboard?tab=record'), '/record');
      expect(resolveAppRoute('/#budget'), '/more/budgets');
    });

    test('handles smartspend:// deep links and trailing slashes', () {
      expect(resolveAppRoute('smartspend://budgets'), '/more/budgets');
      expect(resolveAppRoute('smartspend://more/capture'), '/more/capture');
      expect(resolveAppRoute('smartspend:///wallets/42'), '/more/wallets/42');
      expect(resolveAppRoute('/more/goals/'), '/more/goals');
      expect(
        resolveAppRoute('/stats/category?name=food&month=2026-11'),
        '/stats/category?name=food&month=2026-11',
      );
      expect(resolveAppRoute('/transaction/15'), '/transaction/15');
      expect(resolveAppRoute('/commitments/9'), '/commitments/9');
    });

    test('returns null for empty, external, or unknown paths', () {
      expect(resolveAppRoute(null), isNull);
      expect(resolveAppRoute(''), isNull);
      expect(resolveAppRoute('   '), isNull);
      expect(resolveAppRoute('https://evil.com/budgets'), isNull);
      expect(resolveAppRoute('http://localhost/more/settings'), isNull);
      expect(resolveAppRoute('//evil.com/budgets'), isNull);
      expect(resolveAppRoute('budgets'), isNull);
      expect(resolveAppRoute('/unknown-page'), isNull);
      expect(resolveAppRoute('/wallets/not-an-id'), isNull);
      expect(resolveAppRoute('/404'), isNull);
    });
  });

  group('PushNotificationService.resolveTargetRoute', () {
    test('delegates URL and route payloads to resolveAppRoute', () {
      expect(
        PushNotificationService.resolveTargetRoute({'url': '/budgets'}),
        '/more/budgets',
      );
      expect(
        PushNotificationService.resolveTargetRoute({'route': '/support'}),
        '/more/help',
      );
      expect(
        PushNotificationService.resolveTargetRoute({
          'url': 'https://evil.com/phish',
        }),
        isNull,
      );
      expect(
        PushNotificationService.resolveTargetRoute({'url': '/unknown'}),
        isNull,
      );
    });

    test('maps notification types when no URL is present', () {
      expect(
        PushNotificationService.resolveTargetRoute({'type': 'budget_exceeded'}),
        '/more/budgets',
      );
      expect(
        PushNotificationService.resolveTargetRoute({
          'type': 'subscription_ending',
        }),
        '/more/plan',
      );
      expect(
        PushNotificationService.resolveTargetRoute({
          'type': 'biometric_suggestion',
        }),
        '/more/security',
      );
      expect(
        PushNotificationService.resolveTargetRoute({'type': 'commitment_due'}),
        '/commitments',
      );
      expect(
        PushNotificationService.resolveTargetRoute({
          'type': 'inactivity_reminder',
        }),
        '/record',
      );
      expect(
        PushNotificationService.resolveTargetRoute({
          'type': 'manual_scheduled',
        }),
        '/notifications',
      );
      expect(PushNotificationService.resolveTargetRoute({}), isNull);
    });
  });
}
