import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/streak/streak_badge.dart';

import 'support/test_app.dart';

void main() {
  group('Recording streak (REC-17)', () {
    testWidgets('StreakBadge displays zero days streak with gray badge', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'profile.getSmartProfile',
        (_) => {
          'identity': {'currentStreak': 0},
        },
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);
      await tester.pumpAndSettle();

      expect(find.byType(StreakBadge), findsOneWidget);
      expect(find.text('0 يوم'), findsOneWidget);
    });

    testWidgets(
      'StreakBadge displays active streak with consecutive day label',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'profile.getSmartProfile',
          (_) => {
            'identity': {'currentStreak': 7},
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);
        await tester.pumpAndSettle();

        expect(find.byType(StreakBadge), findsOneWidget);
        expect(find.text('7 يوم متواصل'), findsOneWidget);
      },
    );

    testWidgets('StreakBadge displays high streak (14 days) with fire emoji', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer(
        'profile.getSmartProfile',
        (_) => {
          'identity': {'currentStreak': 14},
        },
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);
      await tester.pumpAndSettle();

      expect(find.byType(StreakBadge), findsOneWidget);
      expect(find.text('14 يوم متواصل 🔥'), findsOneWidget);
    });
  });
}
