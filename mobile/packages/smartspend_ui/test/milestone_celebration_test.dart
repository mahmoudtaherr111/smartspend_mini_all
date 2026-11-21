import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  group('MilestoneCelebration', () {
    testWidgets('renders title, subtitle, and executes onAction on tap', (
      tester,
    ) async {
      var actionCalled = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () {
                  MilestoneCelebration.show(
                    context: context,
                    title: 'مبروك! 🎯',
                    subtitle: 'حققت هدف التوفير',
                    actionLabel: 'تمام',
                    onAction: () => actionCalled = true,
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.text('مبروك! 🎯'), findsOneWidget);
      expect(find.text('حققت هدف التوفير'), findsOneWidget);
      expect(find.text('تمام'), findsOneWidget);
      expect(find.byIcon(Icons.emoji_events_rounded), findsOneWidget);

      await tester.tap(find.text('تمام'));
      await tester.pumpAndSettle();

      expect(actionCalled, isTrue);
      expect(find.byType(MilestoneCelebration), findsNothing);
    });

    testWidgets('renders properly with animations disabled (reduced motion)', (
      tester,
    ) async {
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: MaterialApp(
            theme: SmartSpendTheme.dark(),
            home: const Scaffold(
              body: MilestoneCelebration(
                title: 'مبروك',
                subtitle: 'تم تحقيق الهدف',
              ),
            ),
          ),
        ),
      );

      expect(find.text('مبروك'), findsOneWidget);
      expect(find.text('تم تحقيق الهدف'), findsOneWidget);
      // No TweenAnimationBuilder when motion is disabled
      expect(find.byType(TweenAnimationBuilder<double>), findsNothing);
    });
  });
}
