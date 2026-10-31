import 'package:flutter/material.dart';

import 'buttons.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';

/// A celebration dialog displayed when a financial goal or milestone is achieved.
/// Respects [SmartSpendMotion.enabledOf]:
/// - When motion is enabled: animates in with scale and gentle celebratory flair.
/// - When motion is reduced: displays a restrained, clear congratulations card without movement.
class MilestoneCelebration extends StatelessWidget {
  const MilestoneCelebration({
    super.key,
    required this.title,
    required this.subtitle,
    this.actionLabel = 'تم',
    this.onAction,
  });

  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback? onAction;

  static Future<void> show({
    required BuildContext context,
    required String title,
    required String subtitle,
    String actionLabel = 'تم',
    VoidCallback? onAction,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (context) => MilestoneCelebration(
        title: title,
        subtitle: subtitle,
        actionLabel: actionLabel,
        onAction: onAction,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final motionEnabled = SmartSpendMotion.enabledOf(context);

    final Widget content = Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
      ),
      backgroundColor: colors.surface,
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.emoji_events_rounded,
                size: 36,
                color: colors.accent,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: colors.foreground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: textTheme.bodyMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: actionLabel,
              onPressed: () {
                Navigator.of(context).pop();
                onAction?.call();
              },
            ),
          ],
        ),
      ),
    );

    if (!motionEnabled) {
      return content;
    }

    return TweenAnimationBuilder<double>(
      duration: SmartSpendMotion.of(
        context,
        const Duration(milliseconds: 350),
      ),
      curve: Curves.easeOutBack,
      tween: Tween<double>(begin: 0.8, end: 1.0),
      builder: (context, scale, child) {
        return Transform.scale(
          scale: scale,
          child: child,
        );
      },
      child: content,
    );
  }
}
