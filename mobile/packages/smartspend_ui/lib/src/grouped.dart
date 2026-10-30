import 'package:flutter/material.dart';

import 'haptics.dart';
import 'theme.dart';
import 'tokens.dart';

/// Rows grouped on one rounded surface under a quiet title (design brief §2): settings, a wallet's actions, the
/// More tab. Rows are separated by hairlines that start after their icon.
class GroupedSection extends StatelessWidget {
  const GroupedSection({super.key, this.title, required this.children});

  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: SmartSpendSpacing.lg,
              bottom: SmartSpendSpacing.sm,
              top: SmartSpendSpacing.lg,
            ),
            child: Semantics(
              header: true,
              child: Text(
                title!,
                style: Theme.of(context).textTheme.labelLarge
                    ?.copyWith(color: colors.mutedForeground),
              ),
            ),
          ),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (final (index, child) in children.indexed) ...[
                if (index > 0)
                  Divider(
                    height: 1,
                    indent: 64,
                    endIndent: 0,
                    color: colors.border,
                  ),
                child,
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// A titled card for content that is not a list of rows: a chart, a few sentences.
class GroupedCard extends StatelessWidget {
  const GroupedCard({super.key, this.title, required this.child});

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Semantics(
                header: true,
                child: Text(
                  title!,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(color: colors.foreground),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

/// One row of a [GroupedSection]: a tinted icon tile, a title and an optional detail, and what is at the far end
/// (a value, a switch, or a chevron when it opens a screen).
class GroupedRow extends StatelessWidget {
  const GroupedRow({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.tint,
    this.trailing,
    this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  /// The icon's colour, and its tile's at low strength; the accent by default.
  final Color? tint;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// Signing out, deleting: the danger colour, never a chevron.
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final color = destructive ? colors.danger : (tint ?? colors.accent);
    final end =
        trailing ??
        (onTap != null && !destructive
            ? Icon(Icons.chevron_right_rounded, color: colors.mutedForeground)
            : null);
    return MergeSemantics(
      child: InkWell(
        onTap: onTap == null
            ? null
            : () {
                SmartSpendHaptics.selection();
                onTap!();
              },
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 60),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: SmartSpendSpacing.lg,
              vertical: SmartSpendSpacing.sm,
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                  ),
                  child: Icon(icon, size: 20, color: color),
                ),
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: textTheme.titleMedium?.copyWith(
                          color: destructive ? colors.danger : null,
                        ),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (end != null) ...[
                  const SizedBox(width: SmartSpendSpacing.sm),
                  end,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Moves between months (FND-07): the previous one at the start, the label, and the next one at the end, which is
/// disabled on the current month. The months themselves come from the server (mobile rule 8).
class MonthSwitcher extends StatelessWidget {
  const MonthSwitcher({
    super.key,
    required this.label,
    required this.onPrevious,
    required this.onNext,
    required this.previousTooltip,
    required this.nextTooltip,
  });

  final String label;
  final VoidCallback? onPrevious;

  /// Null on the current month.
  final VoidCallback? onNext;
  final String previousTooltip;
  final String nextTooltip;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    void tap(VoidCallback? action) {
      if (action == null) return;
      SmartSpendHaptics.selection();
      action();
    }

    return Row(
      children: [
        // chevron_left points back to the start in right-to-left too: Flutter mirrors it.
        IconButton(
          tooltip: previousTooltip,
          onPressed: onPrevious == null ? null : () => tap(onPrevious),
          icon: const Icon(Icons.chevron_left_rounded),
        ),
        Expanded(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        IconButton(
          tooltip: nextTooltip,
          onPressed: onNext == null ? null : () => tap(onNext),
          icon: Icon(
            Icons.chevron_right_rounded,
            color: onNext == null ? colors.border : null,
          ),
        ),
      ],
    );
  }
}
