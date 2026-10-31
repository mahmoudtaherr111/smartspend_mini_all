import 'package:flutter/material.dart';

import 'money.dart';
import 'theme.dart';
import 'tokens.dart';

/// Semantic debt status badge that shows both sign and explanatory word,
/// so meaning is never communicated by color alone (Accessibility / REC-19).
///
/// Positive: `+ 500 ج.م (ليك)` - money owed to the user.
/// Negative: `- 500 ج.م (عليك)` - money the user owes.
/// Zero: `0 ج.م (متصفي)` - settled account.
class DebtBadge extends StatelessWidget {
  const DebtBadge({required this.balance, super.key, this.compact = false});

  final num balance;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final locale = MoneyLocale.of(context);
    final isArabic = locale == MoneyLocale.arabic;

    final (color, bgColor, text, semanticLabel) = switch (balance) {
      > 0 => (
        colors.accent,
        colors.accent.withValues(alpha: 0.12),
        isArabic
            ? '+ ${formatMoney(balance, locale: locale)} (ليك)'
            : '+ ${formatMoney(balance, locale: locale)} (owes you)',
        isArabic
            ? 'ليك ${balance.round()} جنيه'
            : 'Owes you ${balance.round()} EGP',
      ),
      < 0 => (
        colors.danger,
        colors.danger.withValues(alpha: 0.12),
        isArabic
            ? '- ${formatMoney(balance.abs(), locale: locale)} (عليك)'
            : '- ${formatMoney(balance.abs(), locale: locale)} (you owe)',
        isArabic
            ? 'عليك ${balance.abs().round()} جنيه'
            : 'You owe ${balance.abs().round()} EGP',
      ),
      _ => (
        colors.mutedForeground,
        colors.mutedForeground.withValues(alpha: 0.12),
        isArabic
            ? '0 ${locale.symbol} (متصفي)'
            : '0 ${locale.symbol} (settled)',
        isArabic ? 'الحساب متصفي' : 'Settled balance',
      ),
    };

    return Semantics(
      label: semanticLabel,
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? SmartSpendSpacing.xs + 2 : SmartSpendSpacing.sm,
          vertical: compact ? 2 : SmartSpendSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
          border: Border.all(color: color.withValues(alpha: 0.3), width: 1),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w600,
            fontSize: compact ? 12 : 13,
            letterSpacing: 0.2,
          ),
        ),
      ),
    );
  }
}
