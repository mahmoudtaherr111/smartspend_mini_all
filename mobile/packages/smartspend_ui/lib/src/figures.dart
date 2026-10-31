import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'haptics.dart';
import 'money.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// The one figure a money screen leads with (design brief §2): what it is, the amount large and bold, and the story
/// behind it as a sentence with the real numbers. Optionally on the brand wash, for the hero of a tab.
class HeroFigure extends StatelessWidget {
  const HeroFigure({
    super.key,
    required this.label,
    required this.amount,
    this.kind = AmountKind.neutral,
    this.story,
    this.wash = false,
    this.leading,
    this.trailing,
    this.amountHeroTag,
  });

  final String label;
  final num amount;
  final AmountKind kind;

  /// One or two short sentences under the amount, for example how it compares with last month.
  final String? story;

  /// Draws the brand wash behind it.
  final bool wash;

  /// At the start of the header row, such as a category's icon tile arriving from a transaction row.
  final Widget? leading;

  /// Beside the label at the other end, for example the month switcher's button.
  final Widget? trailing;

  /// Connects the hero amount to the [TransactionRow] that opened this screen (FND-05).
  final Object? amountHeroTag;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    // Twice the text size still fits a seven-digit amount on one line of a small phone.
    final scaler = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.6);
    Widget amountBox = MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: scaler),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: AlignmentDirectional.centerStart,
        child: AmountText(
          amount,
          kind: kind,
          style: SmartSpendTypography.style(40, FontWeight.w800, height: 1.15),
        ),
      ),
    );
    if (amountHeroTag != null && SmartSpendMotion.enabledOf(context)) {
      amountBox = Hero(
        tag: amountHeroTag!,
        flightShuttleBuilder: smartSpendHeroShuttle,
        child: amountBox,
      );
    }
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: SmartSpendSpacing.md),
            ],
            Expanded(
              child: Text(
                label,
                style: textTheme.titleSmall?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.xs),
        amountBox,
        if (story != null) ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            story!,
            style: textTheme.bodyMedium?.copyWith(color: colors.foreground),
          ),
        ],
      ],
    );
    if (!wash) return content;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: colors.wash(Directionality.of(context)),
        borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
      ),
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.xl),
        child: content,
      ),
    );
  }
}

/// A small figure with its caption, side by side with others under a hero: the daily average, the month's income.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.amount,
    this.kind = AmountKind.neutral,
    this.note,
    this.noteColor,
  });

  final String label;
  final num amount;
  final AmountKind kind;

  /// A short word under the amount, for example «أقل 8%».
  final String? note;
  final Color? noteColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: textTheme.labelMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: AmountText(
                amount,
                kind: kind,
                style: textTheme.titleLarge,
              ),
            ),
            if (note != null) ...[
              const SizedBox(height: SmartSpendSpacing.xs),
              Text(
                note!,
                style: textTheme.labelMedium?.copyWith(
                  color: noteColor ?? colors.mutedForeground,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Stat tiles in a row that wraps to a column when the text is large, so none of them is cut off.
class StatTileRow extends StatelessWidget {
  const StatTileRow({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final large = MediaQuery.textScalerOf(context).scale(10) > 15;
    if (large) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (index, child) in children.indexed) ...[
            if (index > 0) const SizedBox(height: SmartSpendSpacing.sm),
            child,
          ],
        ],
      );
    }
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (index, child) in children.indexed) ...[
            if (index > 0) const SizedBox(width: SmartSpendSpacing.sm),
            Expanded(child: child),
          ],
        ],
      ),
    );
  }
}

/// A share of a whole, for [ProportionBar]: a name, its amount and its colour.
final class ProportionPart {
  const ProportionPart({
    required this.label,
    required this.amount,
    required this.color,
    this.interactive = true,
  });

  final String label;
  final num amount;
  final Color color;

  /// False on a synthetic remainder row («حاجات تانية») that does not name a single category.
  final bool interactive;
}

/// How a whole splits into parts (design brief §8): one rounded bar of segments, then the parts ranked with their
/// amount and share. Refund-netted negative parts sit below with a plus sign and [refundLabel]. A screen reader hears
/// the ranking as sentences; colour is never the only signal, since every segment has its named row.
class ProportionBar extends StatelessWidget {
  const ProportionBar({
    super.key,
    required this.parts,
    this.maxRows = 6,
    this.otherLabel,
    this.refundLabel,
    this.onPartTap,
  });

  final List<ProportionPart> parts;

  /// Positive rows shown before the rest are summed into [otherLabel].
  final int maxRows;
  final String? otherLabel;

  /// Word shown beside a negative, refund-netted category (for example «مرتجع» or "Refund").
  final String? refundLabel;
  final ValueChanged<ProportionPart>? onPartTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final large = MediaQuery.textScalerOf(context).scale(10) > 15;
    final sorted = [...parts.where((p) => p.amount > 0)]
      ..sort((a, b) => b.amount.compareTo(a.amount));
    final refunded = [...parts.where((p) => p.amount < 0)]
      ..sort((a, b) => a.amount.compareTo(b.amount));
    final total = sorted.fold<num>(0, (sum, p) => sum + p.amount);
    if (total <= 0 && refunded.isEmpty) return const SizedBox.shrink();

    var shown = sorted;
    if (sorted.length > maxRows && otherLabel != null) {
      final rest = sorted
          .sublist(maxRows - 1)
          .fold<num>(0, (sum, p) => sum + p.amount);
      shown = [
        ...sorted.take(maxRows - 1),
        ProportionPart(
          label: otherLabel!,
          amount: rest,
          color: colors.mutedForeground,
          interactive: false,
        ),
      ];
    }
    int percent(num amount) => (amount / total * 100).round();

    Widget buildRow(ProportionPart part, {required bool refund}) {
      final canTap = onPartTap != null && part.interactive;
      final share = Text(
        refund ? (refundLabel ?? 'مرتجع') : '${percent(part.amount)}%',
        style: textTheme.labelLarge?.copyWith(
          color: refund ? colors.accent : colors.mutedForeground,
        ),
      );
      final amount = AmountText(
        part.amount.abs(),
        kind: refund ? AmountKind.income : AmountKind.neutral,
        style: textTheme.titleSmall,
      );
      return MergeSemantics(
        child: InkWell(
          onTap: !canTap
              ? null
              : () {
                  SmartSpendHaptics.selection();
                  onPartTap!(part);
                },
          borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                vertical: SmartSpendSpacing.xs,
              ),
              child: Row(
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: part.color,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(part.label, style: textTheme.bodyLarge),
                        if (large)
                          Padding(
                            padding: const EdgeInsets.only(
                              top: SmartSpendSpacing.xs,
                            ),
                            child: Wrap(
                              spacing: SmartSpendSpacing.md,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [share, amount],
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (!large) ...[
                    share,
                    const SizedBox(width: SmartSpendSpacing.md),
                    amount,
                  ],
                  if (canTap) ...[
                    const SizedBox(width: SmartSpendSpacing.xs),
                    ExcludeSemantics(
                      child: Icon(
                        Icons.chevron_right_rounded,
                        size: 18,
                        color: colors.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (total > 0) ...[
          ExcludeSemantics(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
              child: SizedBox(
                height: 14,
                // Stretched: a segment has no content of its own to give it height.
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final (index, part) in shown.indexed) ...[
                      if (index > 0)
                        SizedBox(
                          width: 2,
                          child: ColoredBox(color: colors.surface),
                        ),
                      Expanded(
                        flex: math.max(1, (part.amount / total * 1000).round()),
                        child: ColoredBox(color: part.color),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
        ],
        for (final part in shown) buildRow(part, refund: false),
        for (final part in refunded) buildRow(part, refund: true),
      ],
    );
  }
}
