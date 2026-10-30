import 'package:flutter/widgets.dart';

import 'tokens.dart';

/// How long things move, and how (rule 8.2 of docs/guides/mobile-design.md): short, and not at all when the phone
/// asks for reduced motion.
abstract final class SmartSpendMotion {
  /// A pressed state, a checkbox, a small fade.
  static const short = Duration(milliseconds: 150);

  /// A card appearing, a sheet's content changing.
  static const medium = Duration(milliseconds: 250);

  /// A screen-sized change.
  static const long = Duration(milliseconds: 300);

  static const curve = Curves.easeOutCubic;

  /// [duration], or zero when the person turned animations off (Android's "Remove animations", iOS's Reduce
  /// Motion).
  static Duration of(BuildContext context, Duration duration) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false
      ? Duration.zero
      : duration;
}

/// A column whose children rise into place one after another the first time it is built (design brief §7): the
/// hero first, then its cards, 40 ms apart. Nothing moves under reduced motion, and a rebuild does not replay it.
class StaggeredReveal extends StatefulWidget {
  const StaggeredReveal({
    super.key,
    required this.children,
    this.spacing = SmartSpendSpacing.lg,
  });

  final List<Widget> children;
  final double spacing;

  @override
  State<StaggeredReveal> createState() => _StaggeredRevealState();
}

class _StaggeredRevealState extends State<StaggeredReveal>
    with SingleTickerProviderStateMixin {
  static const _step = Duration(milliseconds: 40);
  late final AnimationController _controller = AnimationController(vsync: this);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller.isAnimating || _controller.value > 0) return;
    final each = SmartSpendMotion.of(context, SmartSpendMotion.medium);
    if (each == Duration.zero) {
      _controller.value = 1;
      return;
    }
    _controller.duration = each + _step * (widget.children.length - 1);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = _controller.duration?.inMilliseconds ?? 1;
    final each = SmartSpendMotion.medium.inMilliseconds;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (index, child) in widget.children.indexed) ...[
          if (index > 0) SizedBox(height: widget.spacing),
          AnimatedBuilder(
            animation: _controller,
            child: child,
            builder: (context, child) {
              final start = (index * _step.inMilliseconds / total).clamp(
                0.0,
                1.0,
              );
              final end = ((index * _step.inMilliseconds + each) / total).clamp(
                start,
                1.0,
              );
              final t = Interval(
                start,
                end,
                curve: SmartSpendMotion.curve,
              ).transform(_controller.value);
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 12),
                  child: child,
                ),
              );
            },
          ),
        ],
      ],
    );
  }
}
