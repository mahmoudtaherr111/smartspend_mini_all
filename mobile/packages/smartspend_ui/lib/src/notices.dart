import 'package:flutter/material.dart';

import 'theme.dart';
import 'tokens.dart';

/// Shows a short notice at the bottom of the screen. With [undoLabel] and [onUndo] it offers to take the action
/// back, which is how reversible actions are confirmed (rule 7.5 of docs/guides/mobile-design.md); a notice with an
/// undo stays until it is used or dismissed, since people need time to read and reach it (Apple, accessibility).
ScaffoldFeatureController<SnackBar, SnackBarClosedReason> showSmartSpendNotice(
  BuildContext context,
  String message, {
  String? undoLabel,
  VoidCallback? onUndo,
}) {
  final colors = context.smartSpendColors;
  final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
  final canUndo = undoLabel != null && onUndo != null;
  return messenger.showSnackBar(
    SnackBar(
      content: Text(
        message,
        style: Theme.of(context).textTheme.bodyMedium
            ?.copyWith(color: colors.foreground),
      ),
      backgroundColor: colors.surfaceRaised,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        side: BorderSide(color: colors.border),
      ),
      duration: canUndo
          ? const Duration(seconds: 8)
          : const Duration(seconds: 4),
      persist: canUndo,
      showCloseIcon: canUndo,
      closeIconColor: colors.mutedForeground,
      action: canUndo
          ? SnackBarAction(
              label: undoLabel,
              textColor: colors.accent,
              onPressed: onUndo,
            )
          : null,
    ),
  );
}
