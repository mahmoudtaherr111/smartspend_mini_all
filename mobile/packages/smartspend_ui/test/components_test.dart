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

  testWidgets(
    'a transaction row stacks its amount under the details at twice the text size',
    (tester) async {
      await tester.pumpWidget(
        _app(
          MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: const TransactionRow(
              icon: Icons.restaurant,
              title: 'قهوة وكافيه',
              subtitle: 'أكل وشرب · 8:20 ص',
              amount: 50,
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      expect(
        tester.getTopLeft(find.byType(AmountText)).dy,
        greaterThan(tester.getBottomLeft(find.text('أكل وشرب · 8:20 ص')).dy),
      );
    },
  );

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

  group('hidden amounts', () {
    testWidgets('an amount shows no digits, and is read as hidden', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _app(
          const MoneyPrivacy(
            hidden: true,
            child: AmountText(185, kind: AmountKind.expense),
          ),
        ),
      );

      expect(find.textContaining('185'), findsNothing);
      expect(find.text('•••• ج.م'), findsOneWidget);
      expect(find.bySemanticsLabel('مصروف مبلغ مخفي'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('text for a notice follows the same choice', (tester) async {
      late String shown;
      late String hidden;
      await tester.pumpWidget(
        _app(
          Column(
            children: [
              Builder(
                builder: (context) {
                  shown = moneyText(context, 1250);
                  return const SizedBox();
                },
              ),
              MoneyPrivacy(
                hidden: true,
                child: Builder(
                  builder: (context) {
                    hidden = moneyText(context, 1250);
                    return const SizedBox();
                  },
                ),
              ),
            ],
          ),
        ),
      );

      expect(shown, '1,250 ج.م');
      expect(hidden, '•••• ج.م');
    });

    test('a written sentence loses its numbers, in either kind of digit', () {
      expect(maskDigits('قهوة 50 وأوبر ١٢٠'), 'قهوة •• وأوبر ••');
      expect(maskDigits('إيجار 1,250.50'), 'إيجار ••');
    });
  });

  group('PIN pad', () {
    testWidgets('keeps the phone pad order in Arabic and sends each digit', (
      tester,
    ) async {
      final typed = <String>[];
      var deleted = 0;
      await tester.pumpWidget(
        _app(
          PinPad(
            onDigit: typed.add,
            onDelete: () => deleted++,
            deleteLabel: 'امسح رقم',
          ),
        ),
      );

      // 1 left of 3 even though the screen is right to left.
      expect(
        tester.getCenter(find.text('1')).dx,
        lessThan(tester.getCenter(find.text('3')).dx),
      );
      for (final digit in ['4', '0', '9']) {
        await tester.tap(find.text(digit));
      }
      await tester.tap(find.bySemanticsLabel('امسح رقم'));
      expect(typed, ['4', '0', '9']);
      expect(deleted, 1);
    });

    testWidgets('ignores the keys while disabled', (tester) async {
      final typed = <String>[];
      await tester.pumpWidget(
        _app(
          PinPad(
            onDigit: typed.add,
            onDelete: () {},
            deleteLabel: 'امسح رقم',
            enabled: false,
          ),
        ),
      );

      await tester.tap(find.text('5'));
      expect(typed, isEmpty);
    });

    testWidgets('the dots say how many digits are in, never which', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _app(
          const PinDots(length: 6, filled: 3, semanticsLabel: 'اتكتب 3 من 6'),
        ),
      );

      expect(find.bySemanticsLabel('اتكتب 3 من 6'), findsOneWidget);
      semantics.dispose();
    });
  });
}
