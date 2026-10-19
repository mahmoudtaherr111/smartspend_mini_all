import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

/// The component in Arabic, right to left, as the app shows it.
Widget _app(Widget child, {ThemeData? theme}) => MaterialApp(
  theme: theme ?? SmartSpendTheme.dark(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar'), Locale('en')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      child: child,
    ),
  ),
);

void main() {
  group('SmartSpendButton', () {
    testWidgets('runs its action when tapped', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        _app(SmartSpendButton(label: 'سجّل', onPressed: () => taps++)),
      );

      await tester.tap(find.text('سجّل'));
      expect(taps, 1);
    });

    testWidgets('while busy shows a spinner and ignores taps', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        _app(
          SmartSpendButton(label: 'سجّل', busy: true, onPressed: () => taps++),
        ),
      );

      expect(find.text('سجّل'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.byType(SmartSpendButton));
      expect(taps, 0);
    });

    testWidgets('is at least 48 high in every variant', (tester) async {
      await tester.pumpWidget(
        _app(
          Column(
            children: [
              for (final variant in ButtonVariant.values)
                SmartSpendButton(
                  label: variant.name,
                  variant: variant,
                  expand: false,
                  onPressed: () {},
                ),
            ],
          ),
        ),
      );

      for (final variant in ButtonVariant.values) {
        final size = tester.getSize(
          find.ancestor(
            of: find.text(variant.name),
            matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
          ),
        );
        expect(size.height, greaterThanOrEqualTo(48), reason: variant.name);
        expect(size.width, greaterThanOrEqualTo(48), reason: variant.name);
      }
    });
  });

  testWidgets('an empty state offers the action that fills it', (tester) async {
    var started = 0;
    await tester.pumpWidget(
      _app(
        EmptyState(
          icon: Icons.receipt_long_outlined,
          title: 'لسه مفيش مصاريف',
          message: 'اكتب أول مصروف وهنصنّفه لوحدنا.',
          actionLabel: 'سجّل مصروف',
          onAction: () => started++,
        ),
      ),
    );

    await tester.tap(find.text('سجّل مصروف'));
    expect(started, 1);
  });

  testWidgets('an error state retries', (tester) async {
    var retries = 0;
    await tester.pumpWidget(
      _app(
        ErrorState(
          message: 'مش قادرين نوصل للسيرفر. اتأكد من النت وجرّب تاني.',
          retryLabel: 'جرّب تاني',
          onRetry: () => retries++,
        ),
      ),
    );

    await tester.tap(find.text('جرّب تاني'));
    expect(retries, 1);
  });

  testWidgets('a transaction row reads its title, details and amount', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    var opened = 0;
    await tester.pumpWidget(
      _app(
        TransactionRow(
          icon: Icons.restaurant,
          title: 'Talabat',
          subtitle: 'أكل وشرب · 9:41 م',
          amount: 185,
          onTap: () => opened++,
        ),
      ),
    );

    expect(find.text('\u2066Talabat\u2069'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('مصروف 185 جنيه')), findsOneWidget);
    await tester.tap(find.byType(TransactionRow));
    expect(opened, 1);
    semantics.dispose();
  });

  testWidgets('a notice with an undo stays until it is used', (tester) async {
    var undone = 0;
    await tester.pumpWidget(
      _app(
        Builder(
          builder: (context) => TextButton(
            onPressed: () => showSmartSpendNotice(
              context,
              'اتمسح المصروف.',
              undoLabel: 'تراجع',
              onUndo: () => undone++,
            ),
            child: const Text('امسح'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('امسح'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 30));
    expect(find.text('اتمسح المصروف.'), findsOneWidget);

    await tester.tap(find.text('تراجع'));
    await tester.pumpAndSettle();
    expect(undone, 1);
    expect(find.text('اتمسح المصروف.'), findsNothing);
  });

  group('haptics', () {
    late List<String> played;

    setUp(() {
      played = [];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            if (call.method == 'HapticFeedback.vibrate') {
              played.add(call.arguments as String);
            }
            return null;
          });
    });

    tearDown(() {
      SmartSpendHaptics.enabled = true;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    test('each meaning plays its own pattern', () async {
      await SmartSpendHaptics.selection();
      await SmartSpendHaptics.success();
      await SmartSpendHaptics.warning();
      await SmartSpendHaptics.error();

      expect(played, [
        'HapticFeedbackType.selectionClick',
        'HapticFeedbackType.successNotification',
        'HapticFeedbackType.warningNotification',
        'HapticFeedbackType.errorNotification',
      ]);
    });

    test('nothing plays when the person turned haptics off', () async {
      SmartSpendHaptics.enabled = false;
      await SmartSpendHaptics.success();
      expect(played, isEmpty);
    });
  });

  testWidgets('motion stops when the phone asks for reduced motion', (
    tester,
  ) async {
    late Duration normal;
    late Duration reduced;
    await tester.pumpWidget(
      Builder(
        builder: (context) {
          normal = SmartSpendMotion.of(context, SmartSpendMotion.medium);
          return MediaQuery(
            data: const MediaQueryData(disableAnimations: true),
            child: Builder(
              builder: (context) {
                reduced = SmartSpendMotion.of(context, SmartSpendMotion.medium);
                return const SizedBox();
              },
            ),
          );
        },
      ),
    );

    expect(normal, SmartSpendMotion.medium);
    expect(reduced, Duration.zero);
  });
}
