import 'package:flutter/material.dart';

/// Cairo for every text, Arabic and Latin, as on the web.
abstract final class SmartSpendTypography {
  /// The family name of the bundled font. A font declared by a package is reached through its package prefix.
  static const fontFamily = 'packages/smartspend_ui/Cairo';

  /// A text style in Cairo at [weight]. Cairo ships as one variable font, so the weight is also set on its `wght`
  /// axis; `fontWeight` alone does not move a variable font on every platform.
  static TextStyle style(double size, FontWeight weight, {double? height}) =>
      TextStyle(
        fontFamily: fontFamily,
        fontSize: size,
        height: height,
        fontWeight: weight,
        fontVariations: [FontVariation.weight(weight.value.toDouble())],
      );

  /// The Material text theme in Cairo, in [color].
  static TextTheme textTheme(Color color) {
    final theme = TextTheme(
      displayLarge: style(48, FontWeight.w800, height: 1.15),
      displayMedium: style(40, FontWeight.w800, height: 1.15),
      displaySmall: style(32, FontWeight.w700, height: 1.2),
      headlineLarge: style(28, FontWeight.w700, height: 1.25),
      headlineMedium: style(24, FontWeight.w700, height: 1.3),
      headlineSmall: style(20, FontWeight.w700, height: 1.35),
      titleLarge: style(18, FontWeight.w700, height: 1.4),
      titleMedium: style(16, FontWeight.w600, height: 1.45),
      titleSmall: style(14, FontWeight.w600, height: 1.45),
      bodyLarge: style(16, FontWeight.w400, height: 1.6),
      bodyMedium: style(14, FontWeight.w400, height: 1.6),
      bodySmall: style(12, FontWeight.w400, height: 1.55),
      labelLarge: style(14, FontWeight.w600, height: 1.4),
      labelMedium: style(12, FontWeight.w600, height: 1.4),
      labelSmall: style(11, FontWeight.w600, height: 1.4),
    );
    return theme.apply(bodyColor: color, displayColor: color);
  }
}
