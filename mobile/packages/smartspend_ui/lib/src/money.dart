import 'package:flutter/material.dart';

import 'bidi.dart';
import 'theme.dart';
import 'typography.dart';

/// How money is written in one interface language. Mirrors the web app's `src/i18n/format.ts#formatCurrency`:
/// whole pounds, Western digits grouped by commas, the currency after the number («1,250 ج.م», "1,250 EGP").
final class MoneyLocale {
  const MoneyLocale._({
    required this.symbol,
    required this.spokenCurrency,
    required this.spokenIncome,
    required this.spokenExpense,
    required this.spokenPending,
  });

  /// Written after the number.
  final String symbol;

  /// Read by screen readers instead of [symbol], which they would spell out letter by letter.
  final String spokenCurrency;
  final String spokenIncome;
  final String spokenExpense;
  final String spokenPending;

  static const arabic = MoneyLocale._(
    symbol: 'ج.م',
    spokenCurrency: 'جنيه',
    spokenIncome: 'دخل',
    spokenExpense: 'مصروف',
    spokenPending: 'لسه بيتسجّل',
  );

  static const english = MoneyLocale._(
    symbol: 'EGP',
    spokenCurrency: 'Egyptian pounds',
    spokenIncome: 'income',
    spokenExpense: 'spent',
    spokenPending: 'still saving',
  );

  /// The locale of the interface around [context]: English when its language is English, Arabic otherwise.
  static MoneyLocale of(BuildContext context) =>
      Localizations.maybeLocaleOf(context)?.languageCode == 'en'
      ? english
      : arabic;
}

/// Writes [value] as money: «1,250 ج.م». Rounds to whole pounds, as the web app does; a negative value keeps its
/// minus sign.
String formatMoney(num value, {MoneyLocale locale = MoneyLocale.arabic}) =>
    '${groupDigits(value.round())} ${locale.symbol}';

/// Groups the digits of a whole number in threes with commas: 1250000 → "1,250,000".
String groupDigits(int value) {
  final digits = value.abs().toString();
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(',');
    grouped.write(digits[i]);
  }
  return value < 0 ? '-$grouped' : grouped.toString();
}

/// Turns Arabic-Indic (٠–٩) and Persian (۰–۹) digits into Western ones, and the Arabic decimal and thousands
/// separators into "." and nothing. People type amounts with either kind of digit.
String normalizeDigits(String text) {
  final out = StringBuffer();
  for (final rune in text.runes) {
    if (rune >= 0x0660 && rune <= 0x0669) {
      out.writeCharCode(0x30 + rune - 0x0660);
    } else if (rune >= 0x06F0 && rune <= 0x06F9) {
      out.writeCharCode(0x30 + rune - 0x06F0);
    } else if (rune == 0x066B) {
      out.write('.');
    } else if (rune != 0x066C) {
      out.writeCharCode(rune);
    }
  }
  return out.toString();
}

/// Reads an amount typed by a person, in either kind of digit, with or without thousands separators:
/// «١٬٢٥٠» , "1,250", "1250.5". Returns null when it is not a positive amount.
num? parseAmount(String text) {
  final cleaned = normalizeDigits(text).replaceAll(RegExp(r'[,\s]'), '');
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(cleaned)) return null;
  final value = num.parse(cleaned);
  return value > 0 ? value : null;
}

/// What an amount means, which decides its sign, its colour and what a screen reader says
/// (rule 6.2 of docs/guides/mobile-design.md: colour is never the only signal).
enum AmountKind {
  /// Money that left: shown with a minus sign.
  expense,

  /// Money that arrived: a plus sign, in the accent colour.
  income,

  /// Recorded on the phone, not yet confirmed by the server: in the warning colour.
  pending,

  /// A total or a balance: no sign.
  neutral,
}

/// An amount of money, in Cairo's equal-width Western digits, kept left to right inside Arabic text so its sign
/// and separators stay in place, and read aloud as words.
class AmountText extends StatelessWidget {
  const AmountText(
    this.value, {
    super.key,
    this.kind = AmountKind.neutral,
    this.style,
  });

  /// The size of the amount, always positive; [kind] gives the sign.
  final num value;
  final AmountKind kind;

  /// Defaults to the bold title style.
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final locale = MoneyLocale.of(context);
    final colors = context.smartSpendColors;
    final whole = groupDigits(value.abs().round());
    final sign = switch (kind) {
      AmountKind.expense => '-',
      AmountKind.income => '+',
      AmountKind.pending || AmountKind.neutral => '',
    };
    final color = switch (kind) {
      AmountKind.income => colors.accent,
      AmountKind.pending => colors.warning,
      AmountKind.expense || AmountKind.neutral => colors.foreground,
    };
    final spokenKind = switch (kind) {
      AmountKind.expense => '${locale.spokenExpense} ',
      AmountKind.income => '${locale.spokenIncome} ',
      AmountKind.pending => '${locale.spokenPending} ',
      AmountKind.neutral => '',
    };
    final base =
        style ??
        Theme.of(context).textTheme.titleMedium ??
        SmartSpendTypography.style(16, FontWeight.w700);
    return Text(
      '${ltrIsolate('$sign$whole')} ${locale.symbol}',
      style: base.copyWith(
        color: color,
        fontWeight: FontWeight.w700,
        fontVariations: SmartSpendTypography.style(
          base.fontSize ?? 16,
          FontWeight.w700,
        ).fontVariations,
      ),
      semanticsLabel:
          '$spokenKind${value.abs().round()} ${locale.spokenCurrency}',
    );
  }
}
