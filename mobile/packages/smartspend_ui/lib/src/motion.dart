import 'package:flutter/widgets.dart';

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
