import 'package:flutter/material.dart';

import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// What a button does, which sets how loud it is. A screen has one [primary] at most (rule 3.3 of
/// docs/guides/mobile-design.md).
enum ButtonVariant {
  /// The main action of the screen: filled with the accent.
  primary,

  /// Another action beside the main one: outlined.
  secondary,

  /// A small or inline action: text only.
  quiet,

  /// An action that removes or ends something: filled with the danger colour.
  destructive,
}

/// The app's button: at least 48 high, a label in Cairo, an optional icon, and a busy state that shows a spinner
/// in place of the label and ignores taps while its action runs.
class SmartSpendButton extends StatelessWidget {
  const SmartSpendButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = ButtonVariant.primary,
    this.icon,
    this.busy = false,
    this.expand = true,
  });

  final String label;

  /// Null disables the button.
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final IconData? icon;
  final bool busy;

  /// Whether it fills the width it is given; quiet buttons usually do not.
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final action = busy ? null : onPressed;
    // A busy button is disabled, so it sits on the theme's disabled fill rather than its own colour: the spinner
    // takes the main text colour, which shows on that fill in both themes.
    final spinnerColor = colors.foreground;
    final Widget content = busy
        ? SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: spinnerColor,
              semanticsLabel: label,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20),
                const SizedBox(width: SmartSpendSpacing.sm),
              ],
              Flexible(child: Text(label, textAlign: TextAlign.center)),
            ],
          );

    final minimumSize = Size(expand ? double.infinity : 48, 52);
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
    );
    final textStyle = SmartSpendTypography.style(16, FontWeight.w700);

    return switch (variant) {
      ButtonVariant.primary => FilledButton(
        onPressed: action,
        style: FilledButton.styleFrom(
          minimumSize: minimumSize,
          shape: shape,
          textStyle: textStyle,
        ),
        child: content,
      ),
      ButtonVariant.destructive => FilledButton(
        onPressed: action,
        style: FilledButton.styleFrom(
          minimumSize: minimumSize,
          shape: shape,
          textStyle: textStyle,
          backgroundColor: colors.danger,
          foregroundColor: colors.brightness == Brightness.dark
              ? colors.background
              : Colors.white,
        ),
        child: content,
      ),
      ButtonVariant.secondary => OutlinedButton(
        onPressed: action,
        style: OutlinedButton.styleFrom(
          minimumSize: minimumSize,
          shape: shape,
          textStyle: textStyle,
          foregroundColor: colors.foreground,
          side: BorderSide(color: colors.border),
        ),
        child: content,
      ),
      ButtonVariant.quiet => TextButton(
        onPressed: action,
        style: TextButton.styleFrom(
          minimumSize: Size(expand ? double.infinity : 48, 48),
          shape: shape,
          textStyle: SmartSpendTypography.style(15, FontWeight.w600),
          foregroundColor: colors.accent,
        ),
        child: content,
      ),
    };
  }
}
