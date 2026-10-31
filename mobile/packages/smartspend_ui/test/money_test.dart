import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  group('formatMoney writes money as the web app does', () {
    // The same cases as src/i18n/format.ts#formatCurrency, which rounds with toLocaleString("en-US").
    for (final (value, arabic, english) in [
      (0, '0 ج.م', '0 EGP'),
      (85, '85 ج.م', '85 EGP'),
      (1250, '1,250 ج.م', '1,250 EGP'),
      (1234567.6, '1,234,568 ج.م', '1,234,568 EGP'),
      (999.5, '1,000 ج.م', '1,000 EGP'),
      (-1250, '-1,250 ج.م', '-1,250 EGP'),
    ]) {
      test('$value', () {
        expect(formatMoney(value), arabic);
        expect(formatMoney(value, locale: MoneyLocale.english), english);
      });
    }
  });

  group('parseAmount reads what people type', () {
    for (final (typed, amount) in [
      ('1250', 1250),
      ('1,250', 1250),
      ('١٢٥٠', 1250),
      ('١٬٢٥٠', 1250),
      ('۱۲۵', 125),
      ('12.5', 12.5),
      ('١٢٫٥٠', 12.5),
      (' 85 ', 85),
    ]) {
      test('«$typed» is $amount', () => expect(parseAmount(typed), amount));
    }

    for (final typed in ['', 'abc', '0', '-5', '12.345', '1.2.3', '١٢ج']) {
      test('«$typed» is not an amount', () => expect(parseAmount(typed), null));
    }

    for (final (typed, amount) in [
      ('0', 0),
      ('-5', -5),
      ('−١٬٢٥٠', -1250),
      ('١٢٥٠٫٥', 1250.5),
    ]) {
      test(
        '«$typed» is the balance $amount',
        () => expect(parseAmount(typed, signed: true), amount),
      );
    }

    for (final typed in ['', '-', '--5', '5-', '12.345']) {
      test(
        '«$typed» is not a balance',
        () => expect(parseAmount(typed, signed: true), null),
      );
    }
  });

  test('normalizeDigits keeps everything that is not a digit', () {
    expect(normalizeDigits('صرفت ٢٠٠ على الأكل'), 'صرفت 200 على الأكل');
  });

  group('names inside Arabic', () {
    test('a Latin name is isolated left to right', () {
      expect(inlineName('UBER *TRIP'), '\u2066UBER *TRIP\u2069');
    });

    test('an Arabic name stays as written', () {
      expect(inlineName('مرتب'), 'مرتب');
      expect(hasRtlLetters('Talabat طلبات'), isTrue);
    });
  });

  group('AmountText', () {
    Future<void> pump(WidgetTester tester, Widget child) => tester.pumpWidget(
      MaterialApp(
        theme: SmartSpendTheme.dark(),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Scaffold(body: Center(child: child)),
      ),
    );

    testWidgets('an expense has a minus sign and is read as words', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await pump(tester, const AmountText(1250, kind: AmountKind.expense));

      expect(find.text('\u2066-1,250\u2069 ج.م'), findsOneWidget);
      expect(find.bySemanticsLabel('مصروف 1250 جنيه'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('income has a plus sign and the accent colour', (tester) async {
      await pump(tester, const AmountText(15000, kind: AmountKind.income));

      final text = tester.widget<Text>(find.byType(Text));
      expect(text.data, '\u2066+15,000\u2069 ج.م');
      expect(text.style?.color, SmartSpendColors.dark.accent);
    });

    testWidgets('pending money is in the warning colour, without a sign', (
      tester,
    ) async {
      await pump(tester, const AmountText(96, kind: AmountKind.pending));

      final text = tester.widget<Text>(find.byType(Text));
      expect(text.data, '\u206696\u2069 ج.م');
      expect(text.style?.color, SmartSpendColors.dark.warning);
    });
  });
}
