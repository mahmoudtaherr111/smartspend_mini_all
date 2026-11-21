import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import 'motion.dart';
import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// How many digits of a PIN are entered: one dot each, filled as the person types. The dots are read as one
/// sentence, such as «اتكتب 3 من 6», never as the digits themselves.
class PinDots extends StatelessWidget {
  const PinDots({
    super.key,
    required this.length,
    required this.filled,
    required this.semanticsLabel,
    this.error = false,
  });

  final int length;
  final int filled;

  /// What a screen reader says for the row.
  final String semanticsLabel;

  /// Draws the dots in the danger colour after a wrong PIN.
  final bool error;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final color = error ? colors.danger : colors.foreground;
    return Semantics(
      label: semanticsLabel,
      liveRegion: true,
      child: ExcludeSemantics(
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < length; i++)
                AnimatedContainer(
                  duration: SmartSpendMotion.of(
                    context,
                    SmartSpendMotion.short,
                  ),
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i < filled ? color : Colors.transparent,
                    border: Border.all(color: color, width: 1.5),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A number pad for a PIN, drawn by the app instead of the phone's keyboard, so no keyboard app sees the digits.
///
/// The keys keep the phone pad's order, 1 2 3 on top and 0 at the bottom, in Arabic too: digits and phone pads are
/// not mirrored (Material's bidirectionality guidance). [leading] takes the free key left of 0, for the fingerprint
/// or face button; the key right of 0 deletes the last digit.
class PinPad extends StatelessWidget {
  const PinPad({
    super.key,
    required this.onDigit,
    required this.onDelete,
    required this.deleteLabel,
    this.leading,
    this.enabled = true,
  });

  final ValueChanged<String> onDigit;
  final VoidCallback onDelete;

  /// What a screen reader says for the delete key.
  final String deleteLabel;

  /// The key left of 0, or an empty space.
  final Widget? leading;

  /// False while the PIN is checked or tries are blocked.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    Widget digit(String value) => _PinKey(
      label: value,
      onPressed: enabled ? () => onDigit(value) : null,
      child: Text(
        value,
        style: SmartSpendTypography.style(28, FontWeight.w600),
      ),
    );
    Widget row(List<Widget> keys) =>
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: keys);
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          row([digit('1'), digit('2'), digit('3')]),
          row([digit('4'), digit('5'), digit('6')]),
          row([digit('7'), digit('8'), digit('9')]),
          row([
            SizedBox.square(dimension: _PinKey.size, child: leading),
            digit('0'),
            _PinKey(
              label: deleteLabel,
              onPressed: enabled ? onDelete : null,
              child: const Icon(Icons.backspace_outlined),
            ),
          ]),
        ],
      ),
    );
  }
}

class _PinKey extends StatelessWidget {
  const _PinKey({
    required this.label,
    required this.onPressed,
    required this.child,
  });

  /// Well above the 48dp minimum (rule 2.1 of docs/guides/mobile-design.md): the pad is used in a hurry.
  static const size = 76.0;

  final String label;
  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.xs),
      child: Semantics(
        button: true,
        enabled: onPressed != null,
        label: label,
        onTap: onPressed,
        excludeSemantics: true,
        child: SizedBox.square(
          dimension: size,
          child: Material(
            color: colors.surfaceRaised,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              // No haptic per key: haptics mark outcomes, never every touch (rule 8.1).
              onTap: onPressed,
              child: Center(
                child: IconTheme.merge(
                  data: IconThemeData(
                    color: onPressed == null
                        ? colors.mutedForeground
                        : colors.foreground,
                  ),
                  child: DefaultTextStyle.merge(
                    style: TextStyle(
                      color: onPressed == null
                          ? colors.mutedForeground
                          : colors.foreground,
                    ),
                    child: child,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Announces [message] to a screen reader at once, for a result the person cannot see change, such as a wrong PIN.
void announceForAccessibility(BuildContext context, String message) {
  SemanticsService.sendAnnouncement(
    View.of(context),
    message,
    Directionality.of(context),
  );
}
