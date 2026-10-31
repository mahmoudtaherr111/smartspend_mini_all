import 'package:flutter/material.dart';

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
      child: builder(sheetContext),
    ),
  );
}
