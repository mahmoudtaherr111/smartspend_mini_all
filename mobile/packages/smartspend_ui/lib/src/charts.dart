import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'figures.dart';
import 'haptics.dart';
import 'money.dart';
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

bool _isEnglishLocale(BuildContext context) =>
    Localizations.maybeLocaleOf(context)?.languageCode == 'en';

/// Computes a clean upper bound for a chart Y-axis (1, 2, 2.5, 5, 10 × 10^k).
double _niceAxisMax(num rawMax) {
  if (rawMax <= 0) return 100;
  final value = rawMax.toDouble();
  final exponent = (math.log(value) / math.ln10).floor();
  final magnitude = math.pow(10, exponent).toDouble();
  final fraction = value / magnitude;
  final niceFraction = fraction <= 1.0
      ? 1.0
      : fraction <= 2.0
      ? 2.0
      : fraction <= 2.5
      ? 2.5
      : fraction <= 5.0
      ? 5.0
      : 10.0;
  return niceFraction * magnitude;
}

/// Formats a compact Y-axis tick label (e.g. `0`, `500`, `2.5K`, `1.2M`).
String _formatAxisTick(double value, {required bool hidden}) {
  if (hidden) return '••';
  if (value <= 0) return '0';
  if (value >= 1000000) {
    final m = value / 1000000;
    final formatted = m == m.roundToDouble()
        ? m.toStringAsFixed(0)
        : m.toStringAsFixed(1);
    return '${formatted}M';
  }
  if (value >= 1000) {
    final k = value / 1000;
    final formatted = k == k.roundToDouble()
        ? k.toStringAsFixed(0)
        : k.toStringAsFixed(1);
    return '${formatted}K';
  }
  return value.round().toString();
}

/// Decides which X-axis label indices to draw so labels never collide on narrow
/// viewports or large text scales while keeping the first and last labels visible.
Set<int> _visibleLabelIndices({
  required int count,
  required double plotWidth,
  required double minLabelWidth,
}) {
  if (count <= 0) return const {};
  if (count == 1) return const {0};
  final maxLabels = math.max(2, (plotWidth / minLabelWidth).floor());
  if (count <= maxLabels) {
    return {for (var i = 0; i < count; i++) i};
  }
  final step = ((count - 1) / (maxLabels - 1)).ceil();
  final visible = <int>{0, count - 1};
  for (var i = step; i < count - 1; i += step) {
    // Skip penultimate tick if it would crowd the final label.
    if ((count - 1 - i) >= (step * 0.65).ceil()) {
      visible.add(i);
    }
  }
  return visible;
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

  String _defaultSummary(BuildContext context) {
    if (widget.spokenSummary != null) return widget.spokenSummary!;
    final sep = _isEnglishLocale(context) ? ', ' : '، ';
    final buffer = StringBuffer(widget.title);
    buffer.write('. ');
    for (final item in widget.data) {
      buffer.write('${item.label}: ${item.amountFormatted ?? item.value}$sep');
    }
    return buffer.toString();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isRtl = Directionality.of(context) == TextDirection.rtl;
    final textScale = MediaQuery.textScalerOf(context).scale(12) / 12;

    return Semantics(
      label: _defaultSummary(context),
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
                      textScale: textScale,
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
    required this.textScale,
  });

  final List<BarDataPoint> data;
  final double progress;
  final SmartSpendColors colors;
  final Color accentColor;
  final bool isRtl;
  final TextTheme textTheme;
  final double textScale;

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    final bottomPadding = 30.0;
    final chartHeight = math.max(24.0, size.height - bottomPadding);
    final baselineY = chartHeight;

    num maxValue = 1;
    for (final item in data) {
      if (item.value > maxValue) maxValue = item.value;
    }

    // Gridlines: 3 subtle lines
    final gridPaint = Paint()
      ..color = colors.border.withValues(alpha: 0.4)
      ..strokeWidth = 1.0;

    for (var i = 1; i <= 3; i++) {
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
    final visibleLabels = _visibleLabelIndices(
      count: n,
      plotWidth: size.width,
      minLabelWidth: math.max(36.0, 32.0 * textScale.clamp(1.0, 1.8)),
    );

    for (var i = 0; i < n; i++) {
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

      if (visibleLabels.contains(index)) {
        final labelStyle =
            (textTheme.labelMedium ??
                    SmartSpendTypography.style(12, FontWeight.w500))
                .copyWith(
                  color: isSpecial ? colors.foreground : colors.mutedForeground,
                  fontWeight: isSpecial ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 12,
                );
        final textPainter = TextPainter(
          text: TextSpan(text: item.label, style: labelStyle),
          textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
          textAlign: TextAlign.center,
          maxLines: 1,
          ellipsis: '…',
        )..layout(maxWidth: math.max(slotWidth, 44.0));

        final dx = (centerX - (textPainter.width / 2))
            .clamp(0.0, math.max(0.0, size.width - textPainter.width))
            .toDouble();
        textPainter.paint(canvas, Offset(dx, baselineY + 6));
      }
    }
  }

  @override
  bool shouldRepaint(covariant _BarChartPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.data != data ||
        oldDelegate.colors != colors ||
        oldDelegate.textScale != textScale;
  }
}

/// A trend line chart built in `smartspend_ui` (FND-04) with CustomPainter.
/// - Handles gaps (months with no data are gaps, not zeros)
/// - Theme colors with soft vertical gradient fill
/// - Y-axis reference labels and responsive X-axis label thinning (>= 12sp)
/// - Tap, drag, and hover tooltip showing the exact formatted amount
/// - Privacy-aware ([MoneyPrivacy]) and screen-reader semantics summary
class SmartSpendLineChart extends StatefulWidget {
  const SmartSpendLineChart({
    super.key,
    required this.title,
    required this.data,
    this.spokenSummary,
    this.emptyLabel,
    this.accentColor,
    this.height = 200,
    this.onPointSelected,
  });

  final String title;
  final List<LineDataPoint> data;
  final String? spokenSummary;

  /// Label announced for points with `null` value (defaults to locale-aware copy).
  final String? emptyLabel;
  final Color? accentColor;
  final double height;
  final ValueChanged<int?>? onPointSelected;

  @override
  State<SmartSpendLineChart> createState() => _SmartSpendLineChartState();
}

class _SmartSpendLineChartState extends State<SmartSpendLineChart>
    with SingleTickerProviderStateMixin {
  static const double _yAxisWidth = 46.0;
  static const double _axisGap = 8.0;

  late AnimationController _controller;
  late Animation<double> _animation;
  int? _selectedIndex;

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
  void didUpdateWidget(covariant SmartSpendLineChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_selectedIndex != null &&
        (_selectedIndex! >= widget.data.length ||
            widget.data[_selectedIndex!].value == null)) {
      _selectedIndex = null;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _defaultSummary(BuildContext context) {
    if (widget.spokenSummary != null) return widget.spokenSummary!;
    final english = _isEnglishLocale(context);
    final sep = english ? ', ' : '، ';
    final emptyText =
        widget.emptyLabel ?? (english ? 'no data' : 'لا توجد بيانات');
    final hidden = MoneyPrivacy.hiddenOf(context);
    final buffer = StringBuffer(widget.title);
    buffer.write('. ');
    for (final item in widget.data) {
      if (item.value != null) {
        final shown = hidden
            ? moneyText(context, item.value!)
            : (item.amountFormatted ?? item.value.toString());
        buffer.write('${item.label}: $shown$sep');
      } else {
        buffer.write('${item.label}: $emptyText$sep');
      }
    }
    return buffer.toString();
  }

  int? _nearestValidIndex(double localDx, double totalWidth, bool isRtl) {
    final n = widget.data.length;
    if (n == 0) return null;
    final plotLeft = isRtl ? 0.0 : _yAxisWidth + _axisGap;
    final plotWidth = math.max(1.0, totalWidth - _yAxisWidth - _axisGap);
    final slotWidth = plotWidth / n;

    int? bestIndex;
    var bestDistance = double.infinity;
    for (var visual = 0; visual < n; visual++) {
      final dataIndex = isRtl ? (n - 1 - visual) : visual;
      if (widget.data[dataIndex].value == null) continue;
      final centerX = plotLeft + slotWidth * visual + (slotWidth / 2);
      final dist = (localDx - centerX).abs();
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = dataIndex;
      }
    }
    return bestIndex;
  }

  void _selectIndex(
    int? index, {
    bool toggleSame = false,
    bool haptic = false,
  }) {
    final next = (toggleSame && index != null && index == _selectedIndex)
        ? null
        : index;
    if (next == _selectedIndex) return;
    if (haptic && next != null) {
      SmartSpendHaptics.selection();
    }
    setState(() => _selectedIndex = next);
    widget.onPointSelected?.call(next);
  }

  String _formattedPointValue(BuildContext context, LineDataPoint point) {
    if (MoneyPrivacy.hiddenOf(context)) {
      return moneyText(context, point.value ?? 0);
    }
    return point.amountFormatted ??
        formatMoney(point.value ?? 0, locale: MoneyLocale.of(context));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isRtl = Directionality.of(context) == TextDirection.rtl;
    final hidden = MoneyPrivacy.hiddenOf(context);
    final textScale = MediaQuery.textScalerOf(context).scale(12) / 12;
    final selectedPoint =
        (_selectedIndex != null && _selectedIndex! < widget.data.length)
        ? widget.data[_selectedIndex!]
        : null;

    return Semantics(
      label: _defaultSummary(context),
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: SmartSpendTypography.style(
                      14,
                      FontWeight.w600,
                    ).copyWith(color: colors.foreground),
                  ),
                ),
                if (selectedPoint != null && selectedPoint.value != null) ...[
                  const SizedBox(width: SmartSpendSpacing.sm),
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: SmartSpendSpacing.sm,
                        vertical: SmartSpendSpacing.xs,
                      ),
                      decoration: BoxDecoration(
                        color: colors.surfaceRaised,
                        borderRadius: BorderRadius.circular(
                          SmartSpendRadii.pill,
                        ),
                        border: Border.all(color: colors.border),
                      ),
                      child: Text(
                        '${selectedPoint.label}: ${_formattedPointValue(context, selectedPoint)}',
                        style: SmartSpendTypography.style(
                          12,
                          FontWeight.w700,
                        ).copyWith(color: colors.foreground),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          ExcludeSemantics(
            child: SizedBox(
              height: widget.height,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final width = constraints.maxWidth;
                  return MouseRegion(
                    onHover: (event) => _selectIndex(
                      _nearestValidIndex(event.localPosition.dx, width, isRtl),
                    ),
                    onExit: (_) => _selectIndex(null),
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapDown: (details) => _selectIndex(
                        _nearestValidIndex(
                          details.localPosition.dx,
                          width,
                          isRtl,
                        ),
                        toggleSame: true,
                        haptic: true,
                      ),
                      onHorizontalDragStart: (details) => _selectIndex(
                        _nearestValidIndex(
                          details.localPosition.dx,
                          width,
                          isRtl,
                        ),
                        haptic: true,
                      ),
                      onHorizontalDragUpdate: (details) => _selectIndex(
                        _nearestValidIndex(
                          details.localPosition.dx,
                          width,
                          isRtl,
                        ),
                        haptic: true,
                      ),
                      child: AnimatedBuilder(
                        animation: _animation,
                        builder: (context, _) {
                          return CustomPaint(
                            size: Size(width, widget.height),
                            painter: _LineChartPainter(
                              data: widget.data,
                              progress: _animation.value,
                              colors: colors,
                              accentColor: widget.accentColor ?? colors.accent,
                              isRtl: isRtl,
                              textTheme: textTheme,
                              textScale: textScale,
                              hidden: hidden,
                              selectedIndex: _selectedIndex,
                              yAxisWidth: _yAxisWidth,
                              axisGap: _axisGap,
                            ),
                          );
                        },
                      ),
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
    required this.textScale,
    required this.hidden,
    required this.selectedIndex,
    required this.yAxisWidth,
    required this.axisGap,
  });

  final List<LineDataPoint> data;
  final double progress;
  final SmartSpendColors colors;
  final Color accentColor;
  final bool isRtl;
  final TextTheme textTheme;
  final double textScale;
  final bool hidden;
  final int? selectedIndex;
  final double yAxisWidth;
  final double axisGap;

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    const topPadding = 12.0;
    const bottomPadding = 30.0;
    final plotLeft = isRtl ? 0.0 : yAxisWidth + axisGap;
    final plotRight = isRtl
        ? math.max(0.0, size.width - yAxisWidth - axisGap)
        : size.width;
    final plotWidth = math.max(1.0, plotRight - plotLeft);
    final plotHeight = math.max(24.0, size.height - topPadding - bottomPadding);
    final baselineY = topPadding + plotHeight;

    num rawMax = 0;
    for (final item in data) {
      if (item.value != null && item.value! > rawMax) {
        rawMax = item.value!;
      }
    }
    final axisMax = _niceAxisMax(rawMax);

    // Gridlines and Y-axis reference labels (0, 50%, 100%)
    final gridPaint = Paint()
      ..color = colors.border.withValues(alpha: 0.45)
      ..strokeWidth = 1.0;

    final axisLabelStyle =
        (textTheme.bodySmall ?? SmartSpendTypography.style(12, FontWeight.w500))
            .copyWith(color: colors.mutedForeground, fontSize: 12);

    const tickFractions = [0.0, 0.5, 1.0];
    for (final fraction in tickFractions) {
      final y = baselineY - (plotHeight * fraction);
      canvas.drawLine(Offset(plotLeft, y), Offset(plotRight, y), gridPaint);

      final tickText = _formatAxisTick(axisMax * fraction, hidden: hidden);
      final tp = TextPainter(
        text: TextSpan(text: tickText, style: axisLabelStyle),
        textDirection: TextDirection.ltr,
        textAlign: isRtl ? TextAlign.left : TextAlign.right,
        maxLines: 1,
      )..layout(maxWidth: yAxisWidth);

      final labelX = isRtl
          ? plotRight + axisGap
          : math.max(0.0, yAxisWidth - tp.width);
      final labelY = (y - tp.height / 2)
          .clamp(0.0, math.max(0.0, baselineY - tp.height / 2))
          .toDouble();
      tp.paint(canvas, Offset(labelX, labelY));
    }

    final n = data.length;
    final slotWidth = plotWidth / n;
    final visibleLabels = _visibleLabelIndices(
      count: n,
      plotWidth: plotWidth,
      minLabelWidth: math.max(46.0, 42.0 * textScale.clamp(1.0, 1.8)),
    );

    final linePaint = Paint()
      ..color = accentColor
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          accentColor.withValues(alpha: 0.22),
          accentColor.withValues(alpha: 0.0),
        ],
      ).createShader(Rect.fromLTWH(plotLeft, topPadding, plotWidth, plotHeight))
      ..style = PaintingStyle.fill;

    final dotPaint = Paint()
      ..color = accentColor
      ..style = PaintingStyle.fill;

    final dotBorderPaint = Paint()
      ..color = colors.surface
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    final segments = <List<Offset>>[];
    var currentSegment = <Offset>[];
    final pointByDataIndex = <int, Offset>{};

    for (var visual = 0; visual < n; visual++) {
      final index = isRtl ? (n - 1 - visual) : visual;
      final item = data[index];
      final centerX = plotLeft + slotWidth * visual + (slotWidth / 2);

      if (item.value != null) {
        final ratio = (item.value! / axisMax).clamp(0.0, 1.0);
        final pointY = baselineY - (ratio * plotHeight * progress);
        final pt = Offset(centerX, pointY);
        currentSegment.add(pt);
        pointByDataIndex[index] = pt;
      } else if (currentSegment.isNotEmpty) {
        segments.add(currentSegment);
        currentSegment = <Offset>[];
      }

      if (visibleLabels.contains(index)) {
        final isSelected = index == selectedIndex;
        final labelStyle =
            (textTheme.bodySmall ??
                    SmartSpendTypography.style(12, FontWeight.w500))
                .copyWith(
                  color: isSelected
                      ? colors.foreground
                      : colors.mutedForeground,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 12,
                );
        final tp = TextPainter(
          text: TextSpan(text: item.label, style: labelStyle),
          textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
          textAlign: TextAlign.center,
          maxLines: 1,
          ellipsis: '…',
        )..layout(maxWidth: math.max(slotWidth * 2, 56.0));

        final dx = (centerX - (tp.width / 2))
            .clamp(plotLeft, math.max(plotLeft, plotRight - tp.width))
            .toDouble();
        tp.paint(canvas, Offset(dx, baselineY + 8));
      }
    }
    if (currentSegment.isNotEmpty) {
      segments.add(currentSegment);
    }

    // Paint area gradient + line stroke for each continuous segment
    for (final segment in segments) {
      if (segment.length >= 2) {
        final area = Path()
          ..moveTo(segment.first.dx, baselineY)
          ..lineTo(segment.first.dx, segment.first.dy);
        final line = Path()..moveTo(segment.first.dx, segment.first.dy);
        for (var i = 1; i < segment.length; i++) {
          area.lineTo(segment[i].dx, segment[i].dy);
          line.lineTo(segment[i].dx, segment[i].dy);
        }
        area
          ..lineTo(segment.last.dx, baselineY)
          ..close();
        canvas.drawPath(area, fillPaint);
        canvas.drawPath(line, linePaint);
      }
    }

    // Vertical selection guide
    final selectedOffset = selectedIndex != null
        ? pointByDataIndex[selectedIndex!]
        : null;
    if (selectedOffset != null) {
      final guidePaint = Paint()
        ..color = accentColor.withValues(alpha: 0.45)
        ..strokeWidth = 1.2;
      canvas.drawLine(
        Offset(selectedOffset.dx, topPadding),
        Offset(selectedOffset.dx, baselineY),
        guidePaint,
      );
    }

    // Data point dots
    for (final entry in pointByDataIndex.entries) {
      final isSelected = entry.key == selectedIndex;
      final pt = entry.value;
      if (isSelected) {
        canvas.drawCircle(
          pt,
          9.0,
          Paint()..color = accentColor.withValues(alpha: 0.22),
        );
        canvas.drawCircle(pt, 5.5, dotPaint);
        canvas.drawCircle(pt, 5.5, dotBorderPaint);
      } else {
        canvas.drawCircle(pt, 3.8, dotPaint);
        canvas.drawCircle(pt, 3.8, dotBorderPaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _LineChartPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.data != data ||
        oldDelegate.colors != colors ||
        oldDelegate.selectedIndex != selectedIndex ||
        oldDelegate.hidden != hidden ||
        oldDelegate.textScale != textScale;
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

  String _defaultSummary(BuildContext context) {
    if (spokenSummary != null) return spokenSummary!;
    final sep = _isEnglishLocale(context) ? ', ' : '، ';
    final total = parts.fold<num>(
      0,
      (sum, p) => sum + (p.amount > 0 ? p.amount : 0),
    );
    final buffer = StringBuffer(title);
    buffer.write('. ');
    for (final p in parts) {
      if (p.amount > 0 && total > 0) {
        final pct = (p.amount / total * 100).round();
        buffer.write('${p.label}: $pct%$sep');
      }
    }
    return buffer.toString();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Semantics(
      label: _defaultSummary(context),
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
