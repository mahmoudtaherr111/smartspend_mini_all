// Adversarial test suite: Directional chevrons, Eastern Arabic numeral parsing,
// and MoneyPrivacy masking verification.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

Widget _appWithDirection({
  required Widget child,
  required TextDirection direction,
  bool hiddenMoney = false,
}) => MaterialApp(
  theme: SmartSpendTheme.dark(),
  locale: direction == TextDirection.rtl
      ? const Locale('ar')
      : const Locale('en'),
  supportedLocales: const [Locale('ar'), Locale('en')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Directionality(
    textDirection: direction,
    child: MoneyPrivacy(
      hidden: hiddenMoney,
      child: Scaffold(body: Center(child: child)),
    ),
  ),
);

void main() {
  group('Adversarial Challenge: Eastern Arabic Numeral Parsing', () {
    test('parses Eastern Arabic digits into valid numbers', () {
      expect(parseAmount('١٥٠٠.٥٠'), 1500.5);
      expect(parseAmount('٢٥٠٠'), 2500);
      expect(parseAmount('١٠٠٠٠٠٠'), 1000000);
    });

    test(
      'parses Arabic thousands (٬) and decimal (٫) separators correctly',
      () {
        // 0x066C is Arabic thousands separator
        expect(parseAmount('١٬٥٠٠.٥٠'), 1500.5);
        // 0x066B is Arabic decimal separator
        expect(parseAmount('١٥٠٠٫٥٠'), 1500.5);
        // Both separators combined
        expect(parseAmount('١٬٥٠٠٫٥٠'), 1500.5);
        // Multiple thousands separators
        expect(parseAmount('١٬٠٠٠٬٠٠٠'), 1000000);
      },
    );

    test('parses Persian digits (۰-۹)', () {
      expect(parseAmount('۱۲۵۰.۵۰'), 1250.5);
      expect(parseAmount('۲۵۰۰'), 2500);
      expect(parseAmount('۱۰۰۰۰۰۰'), 1000000);
    });

    test('handles leading zero, whitespaces, and signed amounts', () {
      expect(parseAmount('  ١٥٠٠.٥٠  '), 1500.5);
      expect(parseAmount('٠.٧٥'), 0.75);
      expect(parseAmount('٠', signed: true), 0);
      expect(parseAmount('−١٥٠٠', signed: true), -1500);
      expect(parseAmount('-٢٥٠٠', signed: true), -2500);
    });

    test('rejects adversarial malformed strings by returning null without exceptions', () {
      final invalidInputs = [
        '',
        '   ',
        '١٥٠٠ج',
        '١٥٠٠.٥٠.٥',
        '١٥٠٠٫٥٠٫٥',
        'ألف وخمسمية',
        '--١٥٠٠',
        '١٥٠٠-',
        '١٥٠٠.١٢٣', // more than 2 decimals
        'abc',
        'NaN',
        'Infinity',
      ];
      for (final invalid in invalidInputs) {
        expect(
          parseAmount(invalid),
          isNull,
          reason: 'Input "$invalid" should parse to null',
        );
      }
    });

    test(
      'normalizeDigits transforms Arabic-Indic and Persian digits in text',
      () {
        expect(
          normalizeDigits('المبلغ هو ١٥٠٠.٥٠ جنيه'),
          'المبلغ هو 1500.50 جنيه',
        );
        expect(
          normalizeDigits('ميزانية ٢٥٠٠ و ١٠٠٠٠٠٠'),
          'ميزانية 2500 و 1000000',
        );
        expect(normalizeDigits('مبلغ ١٬٥٠٠٫٥٠'), 'مبلغ 1500.50');
      },
    );
  });

  group('Adversarial Challenge: Directional Chevrons in RTL vs LTR', () {
    /// Computes the combined horizontal scale factor applied to an [Icon] by
    /// multiplying every [Transform] wrapping its glyph (both ancestors and
    /// Flutter's own internal `matchTextDirection` descendant [Transform]).
    /// A single mirror equals `-1.0`; double-mirroring wrongly cancels to `1.0`.
    double effectiveScaleX(WidgetTester tester, Finder iconFinder) {
      final glyphFinder = find.descendant(
        of: iconFinder,
        matching: find.byType(RichText),
      );
      expect(glyphFinder, findsOneWidget);
      final transforms = find.ancestor(
        of: glyphFinder,
        matching: find.byType(Transform),
      );
      var scaleX = 1.0;
      for (final element in transforms.evaluate()) {
        final widget = element.widget as Transform;
        scaleX *= widget.transform.storage[0];
      }
      return scaleX;
    }

    testWidgets(
      'GroupedRow forward chevron mirrors exactly once (pointing left <) and sits on left in RTL',
      (tester) async {
        await tester.pumpWidget(
          _appWithDirection(
            direction: TextDirection.rtl,
            child: GroupedSection(
              children: [
                GroupedRow(
                  icon: Icons.settings,
                  title: 'إعدادات الحساب',
                  onTap: () {},
                ),
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(Icons.chevron_right_rounded.matchTextDirection, isTrue);
        final iconFinder = find.byIcon(Icons.chevron_right_rounded);
        expect(iconFinder, findsOneWidget);

        // No redundant outer Transform.scale that would cancel Flutter's built-in RTL flip.
        expect(
          find.ancestor(of: iconFinder, matching: find.byType(Transform)),
          findsNothing,
        );
        expect(effectiveScaleX(tester, iconFinder), -1.0);

        final chevronCenter = tester.getCenter(iconFinder);
        final textCenter = tester.getCenter(find.text('إعدادات الحساب'));
        // In RTL, trailing widget is on the left
        expect(chevronCenter.dx, lessThan(textCenter.dx));
      },
    );

    testWidgets(
      'GroupedRow forward chevron is unflipped (pointing right >) and sits on right in LTR',
      (tester) async {
        await tester.pumpWidget(
          _appWithDirection(
            direction: TextDirection.ltr,
            child: GroupedSection(
              children: [
                GroupedRow(
                  icon: Icons.settings,
                  title: 'Account Settings',
                  onTap: () {},
                ),
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();

        final iconFinder = find.byIcon(Icons.chevron_right_rounded);
        expect(iconFinder, findsOneWidget);
        expect(
          find.ancestor(of: iconFinder, matching: find.byType(Transform)),
          findsNothing,
        );
        expect(effectiveScaleX(tester, iconFinder), 1.0);

        final chevronCenter = tester.getCenter(iconFinder);
        final textCenter = tester.getCenter(find.text('Account Settings'));
        // In LTR, trailing widget is on the right
        expect(chevronCenter.dx, greaterThan(textCenter.dx));
      },
    );

    testWidgets(
      'MonthSwitcher arrows mirror exactly once in RTL so previous points right (>) and next points left (<)',
      (tester) async {
        await tester.pumpWidget(
          _appWithDirection(
            direction: TextDirection.rtl,
            child: MonthSwitcher(
              label: 'نوفمبر 2026',
              previousTooltip: 'الشهر اللي قبله',
              nextTooltip: 'الشهر اللي بعده',
              onPrevious: () {},
              onNext: () {},
            ),
          ),
        );
        await tester.pumpAndSettle();

        final prevIcon = find.byIcon(Icons.chevron_left_rounded);
        final nextIcon = find.byIcon(Icons.chevron_right_rounded);
        final labelCenter = tester.getCenter(find.text('نوفمبر 2026'));

        expect(effectiveScaleX(tester, prevIcon), -1.0);
        expect(effectiveScaleX(tester, nextIcon), -1.0);
        // In RTL, start (previous) sits on the right and end (next) sits on the left.
        expect(tester.getCenter(prevIcon).dx, greaterThan(labelCenter.dx));
        expect(tester.getCenter(nextIcon).dx, lessThan(labelCenter.dx));
      },
    );

    testWidgets(
      'MonthSwitcher arrows are unflipped in LTR with previous on left (<) and next on right (>)',
      (tester) async {
        await tester.pumpWidget(
          _appWithDirection(
            direction: TextDirection.ltr,
            child: MonthSwitcher(
              label: 'November 2026',
              previousTooltip: 'Previous month',
              nextTooltip: 'Next month',
              onPrevious: () {},
              onNext: () {},
            ),
          ),
        );
        await tester.pumpAndSettle();

        final prevIcon = find.byIcon(Icons.chevron_left_rounded);
        final nextIcon = find.byIcon(Icons.chevron_right_rounded);
        final labelCenter = tester.getCenter(find.text('November 2026'));

        expect(effectiveScaleX(tester, prevIcon), 1.0);
        expect(effectiveScaleX(tester, nextIcon), 1.0);
        expect(tester.getCenter(prevIcon).dx, lessThan(labelCenter.dx));
        expect(tester.getCenter(nextIcon).dx, greaterThan(labelCenter.dx));
      },
    );
  });

  group('Adversarial Challenge: MoneyPrivacy Masking', () {
    testWidgets(
      'AmountText and moneyText correctly mask financial figures when MoneyPrivacy is hidden',
      (tester) async {
        late String renderedMoneyText;
        await tester.pumpWidget(
          _appWithDirection(
            direction: TextDirection.rtl,
            hiddenMoney: true,
            child: Builder(
              builder: (context) {
                renderedMoneyText = moneyText(context, 15000);
                return const AmountText(15000);
              },
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Plaintext amount must NOT appear
        expect(renderedMoneyText, '•••• ج.م');
        expect(find.textContaining('15000'), findsNothing);
        expect(find.textContaining('15,000'), findsNothing);
        expect(find.text('•••• ج.م'), findsOneWidget);
        expect(find.bySemanticsLabel('مبلغ مخفي'), findsOneWidget);
      },
    );

    testWidgets(
      'AmountText and moneyText display plaintext currency when MoneyPrivacy is visible',
      (tester) async {
        late String renderedMoneyText;
        await tester.pumpWidget(
          _appWithDirection(
            direction: TextDirection.rtl,
            hiddenMoney: false,
            child: Builder(
              builder: (context) {
                renderedMoneyText = moneyText(context, 15000);
                return const AmountText(15000);
              },
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(renderedMoneyText, '15,000 ج.م');
        expect(find.textContaining('15,000'), findsOneWidget);
      },
    );
  });
}
