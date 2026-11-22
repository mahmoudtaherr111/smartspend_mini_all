import 'package:flutter/material.dart';

import 'glass.dart';
import 'haptics.dart';
import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// One tab of [SmartSpendNavigationBar].
final class SmartSpendDestination {
  const SmartSpendDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// Optional slot allowing the app shell to mount a native iOS 26 `UIGlassEffect`
/// tab bar PlatformView (e.g. `IosLiquidGlassTabBar`) while receiving the built-in
/// Impeller Liquid Glass capsule as [fallback].
typedef SmartSpendIosNativeNavBarBuilder = Widget Function(
  BuildContext context,
  List<SmartSpendDestination> destinations,
  int selectedIndex,
  ValueChanged<int> onSelected,
  Widget fallback,
);

/// The bottom tab bar.
///
/// - On iOS: renders a floating Liquid Glass pill capsule with sliding emerald
///   active indicator, horizontal scrub gesture, RTL safety, haptics, and bottom
///   safe area — or delegates to [iosNativeBarBuilder] when provided (passing the
///   Impeller Liquid Glass capsule as `fallback`).
/// - On Android / non-iOS: renders a fast solid Material [NavigationBar] topped
///   by a hairline `outlineVariant` border so bottom composers never visually bleed
///   into the bar.
///
/// Tapping the current tab calls [onSelected] with the same index (without a
/// selection tick) so the screen can return to its top.
class SmartSpendNavigationBar extends StatelessWidget {
  const SmartSpendNavigationBar({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
    this.iosNativeBarBuilder,
  });

  final List<SmartSpendDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final SmartSpendIosNativeNavBarBuilder? iosNativeBarBuilder;

  void _handleSelect(int index) {
    if (index != selectedIndex) SmartSpendHaptics.selection();
    onSelected(index);
  }

  @override
  Widget build(BuildContext context) {
    if (Theme.of(context).platform == TargetPlatform.iOS) {
      final fallback = SmartSpendIosGlassNavigationBar(
        destinations: destinations,
        selectedIndex: selectedIndex,
        onSelected: _handleSelect,
      );
      final nativeBuilder = iosNativeBarBuilder;
      if (nativeBuilder != null && !MediaQuery.highContrastOf(context)) {
        return nativeBuilder(
          context,
          destinations,
          selectedIndex,
          onSelected,
          fallback,
        );
      }
      return fallback;
    }

    final outlineVariant = Theme.of(context).colorScheme.outlineVariant;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: outlineVariant)),
      ),
      child: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: _handleSelect,
        destinations: [
          for (final destination in destinations)
            NavigationDestination(
              icon: Icon(destination.icon),
              selectedIcon: Icon(destination.selectedIcon),
              label: destination.label,
            ),
        ],
      ),
    );
  }
}

/// Floating Liquid Glass pill capsule navigation bar used on iOS (and as the
/// built-in fallback for native iOS 26 `UIGlassEffect` tab bars on iOS 15–18 / tests).
class SmartSpendIosGlassNavigationBar extends StatelessWidget {
  const SmartSpendIosGlassNavigationBar({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<SmartSpendDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    if (destinations.isEmpty) return const SizedBox.shrink();

    final colors = context.smartSpendColors;
    final isDark = colors.brightness == Brightness.dark;
    final isRtl = Directionality.of(context) == TextDirection.rtl;
    final count = destinations.length;
    final safeSelected = selectedIndex.clamp(0, count - 1);
    final duration = SmartSpendMotion.of(context, SmartSpendMotion.short);

    final indicatorFill = colors.accent.withValues(alpha: isDark ? 0.16 : 0.09);
    final indicatorBorder = colors.accent.withValues(
      alpha: isDark ? 0.30 : 0.22,
    );

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          SmartSpendSpacing.md,
          SmartSpendSpacing.xs,
          SmartSpendSpacing.md,
          SmartSpendSpacing.sm,
        ),
        child: SmartSpendGlassSurface(
          borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
          elevated: true,
          padding: const EdgeInsets.all(SmartSpendSpacing.xs),
          child: Material(
            type: MaterialType.transparency,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final segmentWidth = constraints.maxWidth / count;

                void handleScrub(Offset localPosition) {
                  if (segmentWidth <= 0) return;
                  final raw = (localPosition.dx / segmentWidth).floor().clamp(
                    0,
                    count - 1,
                  );
                  final target = isRtl ? (count - 1 - raw) : raw;
                  if (target != safeSelected) {
                    onSelected(target);
                  }
                }

                return GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onHorizontalDragUpdate: (details) =>
                      handleScrub(details.localPosition),
                  child: Stack(
                    children: [
                      AnimatedPositionedDirectional(
                        duration: duration,
                        curve: SmartSpendMotion.curve,
                        start: safeSelected * segmentWidth,
                        width: segmentWidth,
                        top: 0,
                        bottom: 0,
                        child: ExcludeSemantics(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: indicatorFill,
                              borderRadius: BorderRadius.circular(
                                SmartSpendRadii.pill,
                              ),
                              border: Border.all(
                                color: indicatorBorder,
                                width: 0.75,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          for (var i = 0; i < count; i++)
                            Expanded(
                              child: _GlassNavDestinationTile(
                                destination: destinations[i],
                                selected: i == safeSelected,
                                onTap: () => onSelected(i),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassNavDestinationTile extends StatelessWidget {
  const _GlassNavDestinationTile({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final SmartSpendDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final foreground = selected ? colors.accent : colors.mutedForeground;
    final labelStyle = SmartSpendTypography.style(
      12,
      selected ? FontWeight.w700 : FontWeight.w500,
    ).copyWith(color: foreground);

    return MergeSemantics(
      child: Semantics(
        button: true,
        selected: selected,
        child: InkWell(
          borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 52, minWidth: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.xs,
                vertical: SmartSpendSpacing.xs,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    selected ? destination.selectedIcon : destination.icon,
                    size: 22,
                    color: foreground,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    destination.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: labelStyle,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
