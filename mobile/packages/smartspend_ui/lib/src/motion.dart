import 'package:flutter/material.dart';

import 'tokens.dart';

/// How long things move, and how (rule 8.2 of docs/guides/mobile-design.md): short, and not at all when the phone
/// asks for reduced motion.
abstract final class SmartSpendMotion {
  /// A pressed state, a checkbox, a small fade.
  static const short = Duration(milliseconds: 150);

  /// A card appearing, a sheet's content changing.
  static const medium = Duration(milliseconds: 250);

  /// A screen-sized change, and the ceiling of a tab's first reveal (FND-05: <= 300 ms total).
  static const long = Duration(milliseconds: 300);

  static const curve = Curves.easeOutCubic;

  /// [duration], or zero when the person turned animations off (Android's "Remove animations", iOS's Reduce
  /// Motion).
  static Duration of(BuildContext context, Duration duration) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false
      ? Duration.zero
      : duration;

  /// Whether animations are allowed around [context].
  static bool enabledOf(BuildContext context) =>
      !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
}

/// Keeps a [Hero] carrying text on a transparent [Material] while it flies between routes, so its font style stays
/// intact without yellow fallback underlines.
Widget smartSpendHeroShuttle(
  BuildContext flightContext,
  Animation<double> animation,
  HeroFlightDirection flightDirection,
  BuildContext fromHeroContext,
  BuildContext toHeroContext,
) {
  final target = flightDirection == HeroFlightDirection.push
      ? toHeroContext.widget
      : fromHeroContext.widget;
  return Material(
    type: MaterialType.transparency,
    child: target is Hero ? target.child : target,
  );
}

/// A column whose children rise into place one after another the first time it is shown (FND-05, design brief §7):
/// the hero appears first, and the cards follow within 300 ms total. With [sessionKey], a tab's reveal runs once per
/// session instead of repeating on every visit. Nothing moves under reduced motion.
class StaggeredReveal extends StatefulWidget {
  const StaggeredReveal({
    super.key,
    required this.children,
    this.spacing = SmartSpendSpacing.lg,
    this.sessionKey,
  });

  final List<Widget> children;
  final double spacing;

  /// Names a tab or screen whose reveal should play only on its first visit in the current session.
  final String? sessionKey;

  static final Set<String> _revealedKeys = <String>{};

  /// Clears the session memory of which tabs already played their first reveal (for example on sign-out, or in
  /// tests).
  static void resetSession() => _revealedKeys.clear();

  @override
  State<StaggeredReveal> createState() => _StaggeredRevealState();
}

class _StaggeredRevealState extends State<StaggeredReveal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this);
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final key = widget.sessionKey;
    final alreadyRevealed =
        key != null && !StaggeredReveal._revealedKeys.add(key);
    final budget = SmartSpendMotion.of(context, SmartSpendMotion.long);
    if (alreadyRevealed || budget == Duration.zero || widget.children.isEmpty) {
      _controller.value = 1;
      return;
    }
    _controller.duration = widget.children.length == 1
        ? SmartSpendMotion.medium
        : SmartSpendMotion.long;
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.children.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (index, child) in widget.children.indexed) ...[
          if (index > 0) SizedBox(height: widget.spacing),
          AnimatedBuilder(
            animation: _controller,
            child: child,
            builder: (context, child) {
              if (_controller.value >= 1 || count <= 1) {
                final t = SmartSpendMotion.curve.transform(_controller.value);
                return Opacity(
                  opacity: t,
                  child: Transform.translate(
                    offset: Offset(0, (1 - t) * 12),
                    child: child,
                  ),
                );
              }
              // Child 0 (the hero) leads from 0.0 to 0.60; the remaining cards stagger evenly inside 0.16..1.0 so
              // the entire sequence finishes within SmartSpendMotion.long (300 ms).
              final double start;
              final double end;
              if (index == 0) {
                start = 0.0;
                end = 0.60;
              } else {
                final cards = count - 1;
                final span = 0.60;
                final offsetWindow = 1.0 - span - 0.16;
                start =
                    0.16 +
                    (cards <= 1 ? 0.0 : (index - 1) / (cards - 1)) *
                        offsetWindow;
                end = (start + span).clamp(start, 1.0);
              }
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
