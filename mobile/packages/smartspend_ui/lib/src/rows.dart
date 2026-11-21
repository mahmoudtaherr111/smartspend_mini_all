import 'package:flutter/material.dart';

import 'bidi.dart';
import 'haptics.dart';
import 'money.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';

/// The title of a group of rows, with an optional action at the other end ("See all").
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.actionLabel, this.onAction});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Padding(
      padding: const EdgeInsets.only(
        top: SmartSpendSpacing.lg,
        bottom: SmartSpendSpacing.xs,
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(color: colors.mutedForeground),
              ),
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                minimumSize: const Size(48, 48),
                foregroundColor: colors.accent,
              ),
              child: Text(actionLabel!),
            ),
        ],
      ),
    );
  }
}

/// One transaction in a list: what it was, its category and time, and the amount at the far end. A merchant or
/// sender name in Latin letters stays readable inside the Arabic line (rule 2.4), and at large text sizes the amount
/// moves under the subtitle so the row grows in height instead of truncating (design brief §3). With [heroTag],
/// opening the transaction carries its icon and amount into the detail screen (FND-05).
class TransactionRow extends StatelessWidget {
  const TransactionRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.amount,
    this.kind = AmountKind.expense,
    this.iconColor,
    this.heroTag,
    this.onTap,
  });

  /// The category's icon.
  final IconData icon;

  /// What was bought or who sent the money: "Talabat", «مرتب».
  final String title;

  /// The category and the time: «أكل وشرب · 9:41 م».
  final String subtitle;

  final num amount;
  final AmountKind kind;

  /// The category's colour; the accent by default.
  final Color? iconColor;

  /// Connects this row's icon (`(heroTag, 'icon')`) and amount (`(heroTag, 'amount')`) to its detail screen.
  final Object? heroTag;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final tint = iconColor ?? colors.accent;
    final large = MediaQuery.textScalerOf(context).scale(10) > 15;
    final animateHero = heroTag != null && SmartSpendMotion.enabledOf(context);
    Widget iconTile = Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
      ),
      child: Icon(icon, color: tint, size: 22),
    );
    Widget figure = AmountText(amount, kind: kind);
    if (animateHero) {
      iconTile = Hero(tag: (heroTag!, 'icon'), child: iconTile);
      figure = Hero(
        tag: (heroTag!, 'amount'),
        flightShuttleBuilder: smartSpendHeroShuttle,
        child: figure,
      );
    }
    return MergeSemantics(
      child: InkWell(
        onTap: onTap == null
            ? null
            : () {
                SmartSpendHaptics.selection();
                onTap!();
              },
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
            child: Row(
              crossAxisAlignment: large
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.center,
              children: [
                iconTile,
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        inlineName(title),
                        maxLines: large ? null : 1,
                        overflow: large ? null : TextOverflow.ellipsis,
                        style: textTheme.titleSmall,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: large ? null : 1,
                        overflow: large ? null : TextOverflow.ellipsis,
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      if (large) ...[
                        const SizedBox(height: SmartSpendSpacing.xs),
                        figure,
                      ],
                    ],
                  ),
                ),
                if (!large) ...[
                  const SizedBox(width: SmartSpendSpacing.md),
                  figure,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
