import 'package:flutter/material.dart';

import 'buttons.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';

/// Every screen is designed in five states: loading, empty, error, offline and filled (rule 7.3 of
/// docs/guides/mobile-design.md). These are the first four.

/// A message beside a form or a section: an error marked with the danger colour, or a notice with the warning
/// colour. The colour is in the icon and the tint; the words stay in the main text colour, which reads at 4.5:1 on
/// the tint in both themes (rule 6.1 of docs/guides/mobile-design.md). Screen readers announce it when it appears.
class InlineMessage extends StatelessWidget {
  const InlineMessage(this.text, {super.key, this.warning = false});

  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final color = warning ? colors.warning : colors.danger;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(SmartSpendSpacing.md),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              warning ? Icons.info_outline : Icons.error_outline,
              color: color,
              size: 20,
            ),
            const SizedBox(width: SmartSpendSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(color: colors.foreground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Nothing to show yet, said as an invitation: what belongs here and the action that fills it (Nielsen Norman
/// Group, empty states). Only shown after loading has finished.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(SmartSpendSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: colors.accent.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 34, color: colors.accent),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          Text(title, style: textTheme.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            message,
            style: textTheme.bodyMedium?.copyWith(
              color: colors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(label: actionLabel!, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}

/// Something failed: what happened, in the guide's voice, and a way to try again (rule 7.4).
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.message,
    required this.retryLabel,
    required this.onRetry,
  });

  final String message;
  final String retryLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Padding(
      padding: const EdgeInsets.all(SmartSpendSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.cloud_off_outlined,
            size: 40,
            color: colors.mutedForeground,
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          Semantics(
            liveRegion: true,
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: retryLabel,
            onPressed: onRetry,
            variant: ButtonVariant.secondary,
            icon: Icons.refresh,
            expand: false,
          ),
        ],
      ),
    );
  }
}

/// A thin bar saying the phone is offline and what still works, above the content it applies to.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(
          horizontal: SmartSpendSpacing.lg,
          vertical: SmartSpendSpacing.sm,
        ),
        color: colors.surfaceRaised,
        child: Row(
          children: [
            Icon(Icons.wifi_off, size: 18, color: colors.warning),
            const SizedBox(width: SmartSpendSpacing.sm),
            Expanded(
              child: Text(
                message,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: colors.foreground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A grey block standing for content that is loading, in the shape of what will replace it (Nielsen Norman Group,
/// skeleton screens). It breathes slowly, and stays still when the person turned animations off.
class Skeleton extends StatefulWidget {
  const Skeleton({
    super.key,
    this.width,
    this.height = 16,
    this.radius = SmartSpendRadii.sm,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (SmartSpendMotion.of(context, SmartSpendMotion.short) == Duration.zero) {
      _pulse.stop();
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, _) => Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: Color.lerp(
              colors.surfaceRaised,
              colors.border,
              _pulse.value * 0.6,
            ),
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        ),
      ),
    );
  }
}
