import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

Widget _localizedApp({
  required ThemeData theme,
  required Widget home,
  Locale locale = const Locale('ar'),
}) => MaterialApp(
  theme: theme,
  locale: locale,
  supportedLocales: const [Locale('ar'), Locale('en')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: home,
);

void main() {
  Widget testFrame({
    required Widget child,
    Brightness brightness = Brightness.light,
  }) {
    return _localizedApp(
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
      _localizedApp(
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
      _localizedApp(
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
      _localizedApp(
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

  testWidgets('omits price section when priceText is not provided', (
    tester,
  ) async {
    await tester.pumpWidget(
      _localizedApp(
        theme: SmartSpendTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => showUpgradePromptSheet(
                context: context,
                reason: UpgradeLimitReason.general,
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.textContaining('99 ج.م'), findsNothing);
    expect(find.text('ترقية الحساب لباقة برو'), findsOneWidget);
  });

  testWidgets('uses English defaults and supports localized overrides', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.light(),
        locale: const Locale('en'),
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => showUpgradePromptSheet(
                context: context,
                reason: UpgradeLimitReason.export,
                upgradeLabel: 'See Pro plans',
                dismissLabel: 'Not now',
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.text('Export your financial reports'), findsOneWidget);
    expect(find.text('See Pro plans'), findsOneWidget);
    expect(find.text('Not now'), findsOneWidget);
  });

  testWidgets(
    'invokes SmartSpendUpgradePrompt.defaultOnUpgrade with mounted caller context when onUpgrade is omitted',
    (tester) async {
      BuildContext? receivedContext;
      var wasMounted = false;
      SmartSpendUpgradePrompt.defaultOnUpgrade = (ctx) {
        receivedContext = ctx;
        wasMounted = ctx.mounted;
      };
      addTearDown(() => SmartSpendUpgradePrompt.defaultOnUpgrade = null);

      bool? outcome;
      await tester.pumpWidget(
        _localizedApp(
          theme: SmartSpendTheme.dark(),
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () async {
                  outcome = await showUpgradePromptSheet(
                    context: context,
                    reason: UpgradeLimitReason.aiTokens,
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

      await tester.tap(find.text('اشترك الآن في برو'));
      await tester.pumpAndSettle();

      expect(outcome, isTrue);
      expect(receivedContext, isNotNull);
      expect(wasMounted, isTrue);
    },
  );
}
