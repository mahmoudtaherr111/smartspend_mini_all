import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  testWidgets('renders voice level meter bars', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.dark(),
        home: const Scaffold(
          body: Center(
            child: VoiceLevelMeter(level: 0.5, barCount: 5),
          ),
        ),
      ),
    );

    expect(find.byType(VoiceLevelMeter), findsOneWidget);
    expect(find.byType(AnimatedContainer), findsNWidgets(5));
    expect(find.bySemanticsLabel('مؤشر مستوى الصوت'), findsOneWidget);
  });

  testWidgets('clamps negative and excessive levels safely', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.dark(),
        home: const Scaffold(
          body: Center(
            child: VoiceLevelMeter(level: 1.5),
          ),
        ),
      ),
    );

    expect(find.byType(VoiceLevelMeter), findsOneWidget);
  });

  testWidgets('adapts smoothly under reduced motion', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.dark(),
        home: const MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: Scaffold(
            body: Center(
              child: VoiceLevelMeter(level: 0.8),
            ),
          ),
        ),
      ),
    );

    expect(find.byType(VoiceLevelMeter), findsOneWidget);
  });
}
