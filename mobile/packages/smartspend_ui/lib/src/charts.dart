import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'figures.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// A single bar's data for [SmartSpendBarChart].
final class BarDataPoint {
  const BarDataPoint({
    required this.label,
    required this.value,
    this.isHighlighted = false,
    this.isToday = false,
    this.amountFormatted,
  });

  final String label;
  final num value;
  final bool isHighlighted;
  final bool isToday;
  final String? amountFormatted;
}

/// A single data point for [SmartSpendLineChart].
final class LineDataPoint {
  const LineDataPoint({
    required this.label,
    required this.value,
    this.amountFormatted,
  });

  final String label;

  /// Null represents a month or period with no data, rendered as a gap rather than zero.
  final num? value;
  final String? amountFormatted;
}

/// A lightweight, accessible bar chart built in `smartspend_ui` (FND-04) with CustomPainter.
/// - Starts strictly at zero baseline
/// - Minimal grid lines
/// - RTL-aware (bars go right to left in Arabic)
/// - Today/Highlighted marked with distinct shape + styling
/// - Exposes a spoken semantics summary for screen readers
/// - Animates through [SmartSpendMotion] and stays still under reduced motion
class SmartSpendBarChart extends StatefulWidget {
  const SmartSpendBarChart({
    super.key,
    required this.title,
    required this.data,
    this.spokenSummary,
    this.accentColor,
    this.height = 180,
  });

  final String title;
  final List<BarDataPoint> data;
  final String? spokenSummary;
  final Color? accentColor;
  final double height;

  @override
  State<SmartSpendBarChart> createState() => _SmartSpendBarChartState();
}

class _SmartSpendBarChartState extends State<SmartSpendBarChart>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: SmartSpendMotion.medium,
    );
    _animation = CurvedAnimation(
      parent: _controller,
      curve: SmartSpendMotion.curve,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!SmartSpendMotion.enabledOf(context)) {
      _controller.value = 1.0;
    } else {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _defaultSummary() {
    if (widget.spokenSummary != null) return widget.spokenSummary!;
    final buffer = StringBuffer(widget.title);
    buffer.write('. ');
    for (final item in widget.data) {
      buffer.write('${item.label}: ${item.amountFormatted ?? item.value}، ');
    }
    return buffer.toString();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return Semantics(
      label: _defaultSummary(),
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
            child: Text(
              widget.title,
              style: SmartSpendTypography.style(
                14,
                FontWeight.w600,
              ).copyWith(color: colors.foreground),
            ),
          ),
          ExcludeSemantics(
            child: SizedBox(
              height: widget.height,
              child: AnimatedBuilder(
                animation: _animation,
                builder: (context, _) {
                  return CustomPaint(
                    painter: _BarChartPainter(
                      data: widget.data,
                      progress: _animation.value,
                      colors: colors,
                      accentColor: widget.accentColor ?? colors.accent,
                      isRtl: isRtl,
                      textTheme: textTheme,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BarChartPainter extends CustomPainter {
  _BarChartPainter({
    required this.data,
    required this.progress,
    required this.colors,
    required this.accentColor,
    required this.isRtl,
    required this.textTheme,
  });

  final List<BarDataPoint> data;
  final double progress;
  final SmartSpendColors colors;
  final Color accentColor;
  final bool isRtl;
  final TextTheme textTheme;

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    final bottomPadding = 28.0;
    final chartHeight = size.height - bottomPadding;
    final baselineY = chartHeight;

    num maxValue = 1;
    for (final item in data) {
      if (item.value > maxValue) maxValue = item.value;
    }

    // Gridlines: 3 subtle lines
    final gridPaint = Paint()
      ..color = colors.border.withValues(alpha: 0.4)
      ..strokeWidth = 1.0;

    for (int i = 1; i <= 3; i++) {
      final y = chartHeight * (1 - (i / 3));
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // Baseline
    final basePaint = Paint()
      ..color = colors.border
      ..strokeWidth = 1.2;
    canvas.drawLine(
      Offset(0, baselineY),
      Offset(size.width, baselineY),
      basePaint,
    );

    final n = data.length;
    final slotWidth = size.width / n;
    final barWidth = math.min(slotWidth * 0.55, 28.0);

    for (int i = 0; i < n; i++) {
      final index = isRtl ? (n - 1 - i) : i;
      final item = data[index];

      final centerX = slotWidth * i + (slotWidth / 2);
      final barHeight = (item.value / maxValue) * (chartHeight - 16) * progress;
      final barTop = baselineY - barHeight;

      final barRect = Rect.fromCenter(
        center: Offset(centerX, baselineY - (barHeight / 2)),
        width: barWidth,
        height: math.max(0.0, barHeight),
      );

      final isSpecial = item.isHighlighted || item.isToday;
      final barColor = isSpecial
          ? accentColor
          : colors.mutedForeground.withValues(alpha: 0.35);

      final paint = Paint()
        ..color = barColor
        ..style = PaintingStyle.fill;

      final rrect = RRect.fromRectAndCorners(
        barRect,
        topLeft: const Radius.circular(4),
        topRight: const Radius.circular(4),
      );
      canvas.drawRRect(rrect, paint);

      // Distinct shape marker for Today: top indicator circle
      if (item.isToday) {
        final markerPaint = Paint()
          ..color = colors.foreground
          ..style = PaintingStyle.fill;
        canvas.drawCircle(Offset(centerX, barTop - 6), 3, markerPaint);
      }

      // Distinct shape marker for Highlighted: accent stroke outline
      if (item.isHighlighted && !item.isToday) {
        final strokePaint = Paint()
          ..color = colors.foreground
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5;
        canvas.drawRRect(rrect, strokePaint);
      }

      // X-axis label
      final textSpan = TextSpan(
        text: item.label,
        style: textTheme.labelSmall?.copyWith(
          color: isSpecial ? colors.foreground : colors.mutedForeground,
          fontWeight: isSpecial ? FontWeight.w700 : FontWeight.w500,
          fontSize: 11,
        ),
      );
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout(maxWidth: slotWidth);

      textPainter.paint(
        canvas,
        Offset(centerX - (textPainter.width / 2), baselineY + 6),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _BarChartPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.data != data ||
        oldDelegate.colors != colors;
  }
}

/// A trend line chart built in `smartspend_ui` (FND-04) with CustomPainter.
/// - Handles gaps (months with no data are gaps, not zeros)
/// - Theme colors with soft gradient fill
/// - Screen reader semantics summary
class SmartSpendLineChart extends StatefulWidget {
  const SmartSpendLineChart({
    super.key,
    required this.title,
    required this.data,
    this.spokenSummary,
    this.accentColor,
    this.height = 180,
  });

  final String title;
  final List<LineDataPoint> data;
  final String? spokenSummary;
  final Color? accentColor;
  final double height;

  @override
  State<SmartSpendLineChart> createState() => _SmartSpendLineChartState();
}

class _SmartSpendLineChartState extends State<SmartSpendLineChart>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: SmartSpendMotion.medium,
    );
    _animation = CurvedAnimation(
      parent: _controller,
      curve: SmartSpendMotion.curve,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!SmartSpendMotion.enabledOf(context)) {
      _controller.value = 1.0;
    } else {
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _defaultSummary() {
    if (widget.spokenSummary != null) return widget.spokenSummary!;
    final buffer = StringBuffer(widget.title);
    buffer.write('. ');
    for (final item in widget.data) {
      if (item.value != null) {
        buffer.write('${item.label}: ${item.amountFormatted ?? item.value}، ');
      } else {
        buffer.write('${item.label}: لا توجد بيانات، ');
      }
    }
    return buffer.toString();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return Semantics(
      label: _defaultSummary(),
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
            child: Text(
              widget.title,
              style: SmartSpendTypography.style(
                14,
                FontWeight.w600,
              ).copyWith(color: colors.foreground),
            ),
          ),
          ExcludeSemantics(
            child: SizedBox(
              height: widget.height,
              child: AnimatedBuilder(
                animation: _animation,
                builder: (context, _) {
                  return CustomPaint(
                    painter: _LineChartPainter(
                      data: widget.data,
                      progress: _animation.value,
                      colors: colors,
                      accentColor: widget.accentColor ?? colors.accent,
                      isRtl: isRtl,
                      textTheme: textTheme,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LineChartPainter extends CustomPainter {
  _LineChartPainter({
    required this.data,
    required this.progress,
    required this.colors,
    required this.accentColor,
    required this.isRtl,
    required this.textTheme,
  });

  final List<LineDataPoint> data;
  final double progress;
  final SmartSpendColors colors;
  final Color accentColor;
  final bool isRtl;
  final TextTheme textTheme;

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    final bottomPadding = 28.0;
    final chartHeight = size.height - bottomPadding;
    final baselineY = chartHeight;

    num maxValue = 1;
    for (final item in data) {
      if (item.value != null && item.value! > maxValue) {
        maxValue = item.value!;
      }
    }

    // Gridlines
    final gridPaint = Paint()
      ..color = colors.border.withValues(alpha: 0.4)
      ..strokeWidth = 1.0;

    for (int i = 1; i <= 3; i++) {
      final y = chartHeight * (1 - (i / 3));
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final n = data.length;
    final slotWidth = size.width / n;

    final linePaint = Paint()
      ..color = accentColor
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final dotPaint = Paint()
      ..color = accentColor
      ..style = PaintingStyle.fill;

    final dotBorderPaint = Paint()
      ..color = colors.surface
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    Path? currentPath;
    final validPoints = <Offset>[];

    for (int i = 0; i < n; i++) {
      final index = isRtl ? (n - 1 - i) : i;
      final item = data[index];
      final centerX = slotWidth * i + (slotWidth / 2);

      if (item.value != null) {
        final pointY =
            baselineY -
            ((item.value! / maxValue) * (chartHeight - 20) * progress);
        final pt = Offset(centerX, pointY);
        validPoints.add(pt);

        if (currentPath == null) {
          currentPath = Path()..moveTo(pt.dx, pt.dy);
        } else {
          currentPath.lineTo(pt.dx, pt.dy);
        }
      } else {
        // Gap: complete previous path and start fresh on next valid point
        if (currentPath != null) {
          canvas.drawPath(currentPath, linePaint);
          currentPath = null;
        }
      }

      // X-axis label
      final textSpan = TextSpan(
        text: item.label,
        style: textTheme.labelSmall?.copyWith(
          color: colors.mutedForeground,
          fontSize: 10,
        ),
      );
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout(maxWidth: slotWidth);

      textPainter.paint(
        canvas,
        Offset(centerX - (textPainter.width / 2), baselineY + 6),
      );
    }

    if (currentPath != null) {
      canvas.drawPath(currentPath, linePaint);
    }

    // Dots on points
    for (final pt in validPoints) {
      canvas.drawCircle(pt, 4.0, dotPaint);
      canvas.drawCircle(pt, 4.0, dotBorderPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _LineChartPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.data != data ||
        oldDelegate.colors != colors;
  }
}

/// A proportion chart pairing a title sentence stating the finding with the real number
/// with the [ProportionBar] component and an accessible semantics summary (FND-04).
class SmartSpendProportionChart extends StatelessWidget {
  const SmartSpendProportionChart({
    super.key,
    required this.title,
    required this.parts,
    this.spokenSummary,
    this.otherLabel,
    this.refundLabel,
    this.onPartTap,
  });

  final String title;
  final List<ProportionPart> parts;
  final String? spokenSummary;
  final String? otherLabel;
  final String? refundLabel;
  final ValueChanged<ProportionPart>? onPartTap;

  String _defaultSummary() {
    if (spokenSummary != null) return spokenSummary!;
    final total = parts.fold<num>(
      0,
      (sum, p) => sum + (p.amount > 0 ? p.amount : 0),
    );
    final buffer = StringBuffer(title);
    buffer.write('. ');
    for (final p in parts) {
      if (p.amount > 0 && total > 0) {
        final pct = (p.amount / total * 100).round();
        buffer.write('${p.label}: $pct%، ');
      }
    }
    return buffer.toString();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Semantics(
      label: _defaultSummary(),
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
            child: Text(
              title,
              style: SmartSpendTypography.style(
                14,
                FontWeight.w600,
              ).copyWith(color: colors.foreground),
            ),
          ),
          ProportionBar(
            parts: parts,
            otherLabel: otherLabel,
            refundLabel: refundLabel,
            onPartTap: onPartTap,
          ),
        ],
      ),
    );
  }
}
