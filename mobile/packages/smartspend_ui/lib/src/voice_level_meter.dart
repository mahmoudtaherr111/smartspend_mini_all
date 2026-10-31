import 'package:flutter/material.dart';

import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';

/// An animated audio level wave meter for voice recording (REC-05).
/// Fluctuates smoothly with the incoming microphone [level] (0.0 to 1.0).
/// Adapts gracefully under reduced motion (Rule 8.2).
class VoiceLevelMeter extends StatelessWidget {
  const VoiceLevelMeter({
    super.key,
    required this.level,
    this.barCount = 5,
    this.maxHeight = 24.0,
    this.minHeight = 4.0,
    this.barWidth = 3.5,
    this.spacing = 3.0,
    this.color,
  });

  /// The audio input level normalized between 0.0 (silent) and 1.0 (loud).
  final double level;

  /// Number of vertical bars in the wave.
  final int barCount;

  /// Maximum bar height when level is 1.0.
  final double maxHeight;

  /// Minimum bar height at rest.
  final double minHeight;

  /// Width of each bar.
  final double barWidth;

  /// Spacing between adjacent bars.
  final double spacing;

  /// Bar tint color. Defaults to [SmartSpendColors.accent].
  final Color? color;

  static const List<double> _barWeights = [0.4, 0.7, 1.0, 0.75, 0.5];

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final barColor = color ?? colors.accent;
    final clampedLevel = level.clamp(0.0, 1.0);
    final animated = SmartSpendMotion.enabledOf(context);

    return Semantics(
      label: 'مؤشر مستوى الصوت',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          for (var i = 0; i < barCount; i++) ...[
            if (i > 0) SizedBox(width: spacing),
            _buildBar(
              context,
              index: i,
              level: clampedLevel,
              color: barColor,
              animated: animated,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBar(
    BuildContext context, {
    required int index,
    required double level,
    required Color color,
    required bool animated,
  }) {
    final weight = index < _barWeights.length ? _barWeights[index] : 0.6;
    final effectiveHeight =
        minHeight + (maxHeight - minHeight) * level * weight;

    return AnimatedContainer(
      duration: animated ? const Duration(milliseconds: 100) : Duration.zero,
      curve: Curves.easeOutQuad,
      width: barWidth,
      height: effectiveHeight,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.35 + 0.65 * level),
        borderRadius: BorderRadius.circular(2.0),
      ),
    );
  }
}
