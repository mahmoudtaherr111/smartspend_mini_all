import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'haptics.dart';
import 'theme.dart';
import 'tokens.dart';

/// Whether Liquid Glass rendering should be active for [context].
///
/// Liquid Glass is enabled on iOS and automatically falls back to solid surfaces
/// when High Contrast accessibility mode is active, or on Android and other platforms
/// so mid-range and budget Android devices never spend frame budget on real-time blur.
bool isSmartSpendGlassEnabled(BuildContext context) =>
    Theme.of(context).platform == TargetPlatform.iOS &&
    !MediaQuery.highContrastOf(context);

/// A platform-adaptive glass surface.
///
/// - On iOS (standard contrast): renders frosted Liquid Glass using [ClipRRect],
///   [BackdropFilter] (`sigmaX` / `sigmaY` blur), a translucent theme surface tint,
///   and a fine specular rim.
/// - On Android, non-iOS platforms, or High Contrast mode: renders a crisp solid
///   brand surface with an `outlineVariant` border and zero blur overhead.
class SmartSpendGlassSurface extends StatelessWidget {
  const SmartSpendGlassSurface({
    super.key,
    required this.child,
    this.borderRadius = const BorderRadius.all(
      Radius.circular(SmartSpendRadii.lg),
    ),
    this.padding,
    this.margin,
    this.blurSigma = 24,
    this.tintColor,
    this.tintOpacity,
    this.borderColor,
    this.showTopSpecular = true,
    this.elevated = false,
    this.solidColor,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double blurSigma;
  final Color? tintColor;
  final double? tintOpacity;
  final Color? borderColor;
  final bool showTopSpecular;
  final bool elevated;
  final Color? solidColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final outlineVariant = Theme.of(context).colorScheme.outlineVariant;
    final isDark = colors.brightness == Brightness.dark;

    if (!isSmartSpendGlassEnabled(context)) {
      return Container(
        margin: margin,
        padding: padding,
        decoration: BoxDecoration(
          color:
              solidColor ?? (elevated ? colors.surfaceRaised : colors.surface),
          borderRadius: borderRadius,
          border: Border.all(color: borderColor ?? outlineVariant),
        ),
        child: child,
      );
    }

    final resolvedOpacity =
        tintOpacity ??
        (isDark ? (elevated ? 0.78 : 0.72) : (elevated ? 0.86 : 0.78));
    final fillColor = (tintColor ?? colors.surface).withValues(
      alpha: resolvedOpacity,
    );
    final rimColor =
        borderColor ??
        (isDark
            ? Colors.white.withValues(alpha: 0.16)
            : outlineVariant.withValues(alpha: 0.75));
    final topSpecularColor = isDark
        ? Colors.white.withValues(alpha: 0.24)
        : Colors.white.withValues(alpha: 0.85);

    Widget content = child;
    if (padding != null) {
      content = Padding(padding: padding!, child: content);
    }

    Widget surface = ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: borderRadius,
            border: Border.all(color: rimColor, width: 0.75),
          ),
          child: showTopSpecular
              ? Stack(
                  fit: StackFit.passthrough,
                  children: [
                    content,
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 1,
                      child: IgnorePointer(
                        child: ExcludeSemantics(
                          child: ColoredBox(color: topSpecularColor),
                        ),
                      ),
                    ),
                  ],
                )
              : content,
        ),
      ),
    );

    if (elevated) {
      surface = DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: borderRadius,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.34 : 0.08),
              blurRadius: 22,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: surface,
      );
    }

    if (margin != null) {
      surface = Padding(padding: margin!, child: surface);
    }
    return surface;
  }
}

/// A platform-adaptive app bar.
///
/// On iOS (standard contrast), renders a translucent Liquid Glass header with frosted blur
/// and a hairline specular bottom border. On Android and High Contrast mode, renders a
/// crisp solid Material [AppBar] with zero blur cost.
class SmartSpendGlassAppBar extends StatelessWidget
    implements PreferredSizeWidget {
  const SmartSpendGlassAppBar({
    super.key,
    this.title,
    this.leading,
    this.automaticallyImplyLeading = true,
    this.actions,
    this.bottom,
    this.centerTitle,
    this.titleSpacing,
    this.leadingWidth,
    this.toolbarHeight = kToolbarHeight,
    this.blurSigma = 24,
  });

  final Widget? title;
  final Widget? leading;
  final bool automaticallyImplyLeading;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final bool? centerTitle;
  final double? titleSpacing;
  final double? leadingWidth;
  final double toolbarHeight;
  final double blurSigma;

  @override
  Size get preferredSize =>
      Size.fromHeight(toolbarHeight + (bottom?.preferredSize.height ?? 0));

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final isDark = colors.brightness == Brightness.dark;
    final glass = isSmartSpendGlassEnabled(context);

    if (!glass) {
      return AppBar(
        title: title,
        leading: leading,
        automaticallyImplyLeading: automaticallyImplyLeading,
        actions: actions,
        bottom: bottom,
        centerTitle: centerTitle,
        titleSpacing: titleSpacing,
        leadingWidth: leadingWidth,
        toolbarHeight: toolbarHeight,
      );
    }

    final tint = colors.background.withValues(alpha: isDark ? 0.72 : 0.80);
    final edge = isDark
        ? Colors.white.withValues(alpha: 0.14)
        : Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.8);

    return AppBar(
      title: title,
      leading: leading,
      automaticallyImplyLeading: automaticallyImplyLeading,
      actions: actions,
      bottom: bottom,
      centerTitle: centerTitle ?? true,
      titleSpacing: titleSpacing,
      leadingWidth: leadingWidth,
      toolbarHeight: toolbarHeight,
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      flexibleSpace: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: tint,
              border: Border(bottom: BorderSide(color: edge, width: 0.5)),
            ),
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
  }
}

/// Bottom composer dock container for quick-record and AI chat inputs.
///
/// - On iOS (standard contrast): renders a floating Liquid Glass capsule with generous
///   rounding and clean margins above the navigation bar or keyboard.
/// - On Android / High Contrast mode: renders a crisp solid surface with a hairline top
///   border (`outlineVariant`) so it separates cleanly from [SmartSpendNavigationBar].
class SmartSpendGlassDock extends StatelessWidget {
  const SmartSpendGlassDock({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.symmetric(
      horizontal: SmartSpendSpacing.md,
      vertical: SmartSpendSpacing.sm,
    ),
    this.iosMargin = const EdgeInsets.fromLTRB(
      SmartSpendSpacing.md,
      SmartSpendSpacing.xs,
      SmartSpendSpacing.md,
      SmartSpendSpacing.sm,
    ),
    this.safeAreaBottom = false,
    this.borderRadius = SmartSpendRadii.lg,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry iosMargin;
  final bool safeAreaBottom;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final outlineVariant = Theme.of(context).colorScheme.outlineVariant;

    if (isSmartSpendGlassEnabled(context)) {
      Widget dock = SmartSpendGlassSurface(
        borderRadius: BorderRadius.circular(borderRadius),
        margin: iosMargin,
        padding: padding,
        elevated: true,
        child: child,
      );
      if (safeAreaBottom) {
        dock = SafeArea(top: false, child: dock);
      }
      return dock;
    }

    Widget content = Padding(padding: padding, child: child);
    if (safeAreaBottom) {
      content = SafeArea(top: false, child: content);
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: outlineVariant)),
      ),
      child: content,
    );
  }
}

/// Standalone keyboard accessory strip showing a localized "Done" button above the iOS keyboard.
class SmartSpendKeyboardAccessoryBar extends StatelessWidget {
  const SmartSpendKeyboardAccessoryBar({
    super.key,
    this.doneLabel = 'تم',
    required this.onDone,
    this.leading,
  });

  final String doneLabel;
  final VoidCallback onDone;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final outlineVariant = Theme.of(context).colorScheme.outlineVariant;
    final isDark = colors.brightness == Brightness.dark;
    final glass = isSmartSpendGlassEnabled(context);

    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.sm),
      child: Row(
        children: [
          if (leading != null) Expanded(child: leading!) else const Spacer(),
          TextButton(
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 48),
              foregroundColor: colors.accent,
              textStyle: Theme.of(context).textTheme.titleSmall,
            ),
            onPressed: () {
              SmartSpendHaptics.selection();
              onDone();
            },
            child: Text(doneLabel),
          ),
        ],
      ),
    );

    if (!glass) {
      return Material(
        color: colors.surface,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: outlineVariant),
              bottom: BorderSide(color: outlineVariant),
            ),
          ),
          child: row,
        ),
      );
    }

    final tint = colors.surface.withValues(alpha: isDark ? 0.82 : 0.88);
    final rim = isDark
        ? Colors.white.withValues(alpha: 0.16)
        : outlineVariant.withValues(alpha: 0.85);

    return Material(
      type: MaterialType.transparency,
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: tint,
              border: Border(
                top: BorderSide(color: rim, width: 0.5),
                bottom: BorderSide(color: rim, width: 0.5),
              ),
            ),
            child: row,
          ),
        ),
      ),
    );
  }
}

/// Wraps a form or input subtree and shows a Liquid Glass "Done" bar above the iOS keyboard
/// whenever any [focusNodes] has focus.
///
/// iOS numeric and phone keyboards have no Done/Return key; this gives users a clear,
/// reachable way to dismiss the keyboard without changing the child's layout constraints.
/// On Android and other platforms, returns [child] directly as a no-op.
class SmartSpendKeyboardAccessory extends StatefulWidget {
  const SmartSpendKeyboardAccessory({
    super.key,
    required this.child,
    required this.focusNodes,
    this.doneLabel = 'تم',
    this.onDone,
    this.leading,
  });

  final Widget child;
  final List<FocusNode> focusNodes;
  final String doneLabel;
  final VoidCallback? onDone;
  final Widget? leading;

  @override
  State<SmartSpendKeyboardAccessory> createState() =>
      _SmartSpendKeyboardAccessoryState();
}

class _SmartSpendKeyboardAccessoryState
    extends State<SmartSpendKeyboardAccessory> {
  final OverlayPortalController _portalController = OverlayPortalController();
  bool _isIos = false;

  bool get _hasTrackedFocus => widget.focusNodes.any((node) => node.hasFocus);

  @override
  void initState() {
    super.initState();
    _attachNodes(widget.focusNodes);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _isIos = Theme.of(context).platform == TargetPlatform.iOS;
    _scheduleSync();
  }

  @override
  void didUpdateWidget(covariant SmartSpendKeyboardAccessory oldWidget) {
    super.didUpdateWidget(oldWidget);
    _detachNodes(oldWidget.focusNodes);
    _attachNodes(widget.focusNodes);
    _scheduleSync();
  }

  @override
  void dispose() {
    _detachNodes(widget.focusNodes);
    super.dispose();
  }

  void _attachNodes(List<FocusNode> nodes) {
    for (final node in nodes) {
      node.addListener(_onFocusChanged);
    }
  }

  void _detachNodes(List<FocusNode> nodes) {
    for (final node in nodes) {
      node.removeListener(_onFocusChanged);
    }
  }

  void _onFocusChanged() {
    if (!mounted) return;
    if (SchedulerBinding.instance.schedulerPhase == SchedulerPhase.idle) {
      _syncNow();
    } else {
      _scheduleSync();
    }
  }

  void _scheduleSync() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncNow();
    });
  }

  void _syncNow() {
    final shouldShow = _isIos && _hasTrackedFocus;
    if (shouldShow && !_portalController.isShowing) {
      _portalController.show();
    } else if (!shouldShow && _portalController.isShowing) {
      _portalController.hide();
    }
  }

  void _handleDone() {
    for (final node in widget.focusNodes) {
      if (node.hasFocus) {
        node.unfocus();
      }
    }
    FocusManager.instance.primaryFocus?.unfocus();
    widget.onDone?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (Theme.of(context).platform != TargetPlatform.iOS) {
      return widget.child;
    }

    return OverlayPortal(
      controller: _portalController,
      overlayChildBuilder: (overlayContext) {
        final bottomInset = MediaQuery.viewInsetsOf(overlayContext).bottom;
        return Positioned(
          left: 0,
          right: 0,
          bottom: bottomInset,
          child: SafeArea(
            top: false,
            bottom: bottomInset == 0,
            child: SmartSpendKeyboardAccessoryBar(
              doneLabel: widget.doneLabel,
              leading: widget.leading,
              onDone: _handleDone,
            ),
          ),
        );
      },
      child: widget.child,
    );
  }
}
