import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  Widget testFrame({
    required Widget child,
    Brightness brightness = Brightness.light,
  }) {
    return MaterialApp(
      theme: brightness == Brightness.dark
          ? SmartSpendTheme.dark()
          : SmartSpendTheme.light(),
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () => showUpgradePromptSheet(
                context: context,
                reason: UpgradeLimitReason.voiceSeconds,
                priceText: '99 ج.م / شهرياً',
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('renders upgrade prompt with specific reason and highlights', (
    tester,
  ) async {
    await tester.pumpWidget(testFrame(child: const SizedBox()));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.text('تسجيل صوتي بلا حدود مع برو'), findsOneWidget);
    expect(find.textContaining('استهلكت كل ثواني الصوت'), findsOneWidget);
    expect(find.text('99 ج.م / شهرياً'), findsOneWidget);
    expect(find.text('اشترك الآن في برو'), findsOneWidget);
    expect(find.text('ربما لاحقاً'), findsOneWidget);
  });

  testWidgets('dismissing via quiet button closes sheet and returns false', (
    tester,
  ) async {
    bool? outcome;
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () async {
                outcome = await showUpgradePromptSheet(
                  context: context,
                  reason: UpgradeLimitReason.receipts,
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

    expect(find.text('تصوير الفواتير بالذكاء الاصطناعي'), findsOneWidget);

    await tester.tap(find.text('ربما لاحقاً'));
    await tester.pumpAndSettle();

    expect(find.text('تصوير الفواتير بالذكاء الاصطناعي'), findsNothing);
    expect(outcome, false);
  });

  testWidgets('tapping upgrade button calls callback and returns true', (
    tester,
  ) async {
    bool called = false;
    bool? outcome;
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () async {
                outcome = await showUpgradePromptSheet(
                  context: context,
                  reason: UpgradeLimitReason.goals,
                  onUpgrade: () => called = true,
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

    expect(find.text('أهداف مالية غير محدودة'), findsOneWidget);

    await tester.tap(find.text('اشترك الآن في برو'));
    await tester.pumpAndSettle();

    expect(called, true);
    expect(outcome, true);
  });

  testWidgets('renders cleanly at 200% text scale without overflow', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.dark(),
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(360, 640),
            textScaler: TextScaler.linear(2.0),
          ),
          child: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => showUpgradePromptSheet(
                  context: context,
                  reason: UpgradeLimitReason.budgets,
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.text('ميزانيات مخصصة لكل فئة'), findsOneWidget);
    // Verify no render flex overflow was thrown
    expect(tester.takeException(), isNull);
  });
}
