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
            ? '+ ${moneyText(context, balance)} (ليك)'
            : '+ ${moneyText(context, balance)} (owes you)',
        isArabic
            ? 'ليك ${moneyText(context, balance)}'
            : 'Owes you ${moneyText(context, balance)}',
      ),
      < 0 => (
        colors.danger,
        colors.danger.withValues(alpha: 0.12),
        isArabic
            ? '- ${moneyText(context, balance.abs())} (عليك)'
            : '- ${moneyText(context, balance.abs())} (you owe)',
        isArabic
            ? 'عليك ${moneyText(context, balance.abs())}'
            : 'You owe ${moneyText(context, balance.abs())}',
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
          style: Theme.of(context).textTheme.labelMedium
              ?.copyWith(color: color),
        ),
      ),
    );
  }
}
