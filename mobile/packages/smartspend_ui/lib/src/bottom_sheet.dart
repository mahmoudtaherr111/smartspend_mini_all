import 'package:flutter/material.dart';

import 'buttons.dart';
import 'tokens.dart';

/// Opens a SmartSpend bottom sheet: a drag handle, swipe down or tap outside to close, as tall as its content up
/// to the safe area, and lifted above the keyboard so a field inside stays visible.
///
/// Set [isDismissible] to false for a sheet that must end in a choice, such as a confirmation that deletes data;
/// it then also refuses the swipe.
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
}) {
  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    enableDrag: isDismissible,
    isDismissible: isDismissible,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
      ),
      // The keyboard is paid for here, once: a sheet that also reads it inside would rise twice as far.
      child: MediaQuery.removeViewInsets(
        context: sheetContext,
        removeBottom: true,
        child: Builder(builder: builder),
      ),
    ),
  );
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
    builder: (sheetContext) => SafeArea(
      child: Padding(
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
    ),
  );
  return confirmed == true;
}
