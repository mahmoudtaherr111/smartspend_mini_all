import 'package:flutter/material.dart';

import 'buttons.dart';
import 'glass.dart';
import 'theme.dart';
import 'tokens.dart';

/// Opens a SmartSpend bottom sheet: a drag handle, swipe down or tap outside to close, as tall as its content up
/// to the safe area, centrally protected by a bottom [SafeArea], and lifted above the keyboard so a field inside
/// stays visible.
///
/// Set [isDismissible] to false for a sheet that must end in a choice, such as a confirmation that deletes data;
/// it then also refuses the swipe.
///
/// Set [scrollable] to true for sheets with inputs or tall content so they smoothly scroll inside
/// [maxHeightFactor] of the viewport instead of overflowing when the keyboard opens or text scales up.
///
/// On iOS (standard contrast), renders with a frosted Liquid Glass sheet surface, specular top rim, and translucent
/// drag handle. On Android and High Contrast mode, renders as a crisp solid surface with zero blur overhead.
///
/// Sheets that accept input (such as edit sheets and forms) track dirty state and wrap their contents in
/// [PopScope] with `canPop: !isDirty` to intercept accidental dismissal, swipe down, or back gestures, asking
/// for confirmation before discarding unsaved edits (FND-09).
///
/// The sheet opens on the root navigator, so it covers the tab bar instead of sliding up behind it.
Future<T?> showSmartSpendSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isDismissible = true,
  bool scrollable = false,
  double maxHeightFactor = 0.92,
}) {
  final useGlass = isSmartSpendGlassEnabled(context);

  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: !useGlass,
    backgroundColor: useGlass ? Colors.transparent : null,
    enableDrag: isDismissible,
    isDismissible: isDismissible,
    builder: (sheetContext) {
      final bottomInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
      final maxHeight =
          MediaQuery.sizeOf(sheetContext).height * maxHeightFactor;
      final glassNow = isSmartSpendGlassEnabled(sheetContext);

      Widget body = Builder(builder: builder);
      if (scrollable) {
        body = ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: body,
          ),
        );
      }

      // The keyboard is paid for here, once: a sheet that also reads it inside would rise twice as far.
      // SafeArea(top: false) protects bottom actions from Android system bars and the iPhone home indicator.
      Widget sheetContent = Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: MediaQuery.removeViewInsets(
          context: sheetContext,
          removeBottom: true,
          child: SafeArea(
            top: false,
            child: glassNow
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const _GlassDragHandle(),
                      Flexible(child: body),
                    ],
                  )
                : body,
          ),
        ),
      );

      if (glassNow) {
        final isDark =
            sheetContext.smartSpendColors.brightness == Brightness.dark;
        sheetContent = SmartSpendGlassSurface(
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(SmartSpendRadii.sheet),
          ),
          blurSigma: 28,
          tintOpacity: isDark ? 0.80 : 0.86,
          child: sheetContent,
        );
      }

      return sheetContent;
    },
  );
}

class _GlassDragHandle extends StatelessWidget {
  const _GlassDragHandle();

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return ExcludeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.md),
        child: Center(
          child: Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: colors.mutedForeground.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
            ),
          ),
        ),
      ),
    );
  }
}

/// A sheet's first line: its title, and one action at the end of it.
class SheetHeader extends StatelessWidget {
  const SheetHeader({super.key, required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final trailing = this.trailing;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.md,
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: SmartSpendSpacing.sm),
            trailing,
          ],
        ],
      ),
    );
  }
}

/// Asks before something that cannot be undone, and answers true only for the confirming button. It cannot be
/// swiped away, so it always ends in a choice (rule 4.4 of docs/guides/mobile-design.md).
Future<bool> confirmInSheet({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  required String cancelLabel,
  bool destructive = true,
}) async {
  final confirmed = await showSmartSpendSheet<bool>(
    context: context,
    isDismissible: false,
    scrollable: true,
    builder: (sheetContext) => Padding(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              title,
              style: Theme.of(sheetContext).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(message, style: Theme.of(sheetContext).textTheme.bodyMedium),
          const SizedBox(height: SmartSpendSpacing.xl),
          SmartSpendButton(
            label: confirmLabel,
            variant: destructive
                ? ButtonVariant.destructive
                : ButtonVariant.primary,
            onPressed: () => Navigator.of(sheetContext).pop(true),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: cancelLabel,
            variant: ButtonVariant.secondary,
            onPressed: () => Navigator.of(sheetContext).pop(false),
          ),
        ],
      ),
    ),
  );
  return confirmed == true;
}
