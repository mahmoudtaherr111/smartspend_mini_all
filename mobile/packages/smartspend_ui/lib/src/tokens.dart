import 'package:flutter/painting.dart';
import 'package:flutter/services.dart' show Brightness;

/// The colors of one brightness. The values follow the web app (`src/index.css`, `tailwind.config.js`): the
/// near-black navy of the dark theme and its splash screen, the emerald accent most screens use, indigo for AI.
/// Every text colour reaches 4.5:1 on every surface of its theme (rule 6.1 of docs/guides/mobile-design.md,
/// `test/contrast_test.dart`), which is why the light theme uses darker shades than the web's.
final class SmartSpendColors {
  const SmartSpendColors({
    required this.brightness,
    required this.background,
    required this.surface,
    required this.surfaceRaised,
    required this.border,
    required this.foreground,
    required this.mutedForeground,
    required this.accent,
    required this.accentGlow,
    required this.onAccent,
    required this.ai,
    required this.warning,
    required this.danger,
    required this.info,
  });

  final Brightness brightness;

  /// Behind everything; the dark one is the Capacitor splash colour `#090d16`.
  final Color background;

  /// Cards, sheets and the bottom bar.
  final Color surface;

  /// A surface on a surface: a field inside a sheet, a pressed card.
  final Color surfaceRaised;

  final Color border;
  final Color foreground;
  final Color mutedForeground;

  /// The brand accent: actions, the selected tab, money that arrived.
  final Color accent;

  /// The lighter accent used for glows and highlights on the dark theme.
  final Color accentGlow;

  final Color onAccent;

  /// The AI Center's colour.
  final Color ai;

  final Color warning;

  /// Errors, and money over a budget.
  final Color danger;

  final Color info;

  static const dark = SmartSpendColors(
    brightness: Brightness.dark,
    background: Color(0xFF090D16),
    surface: Color(0xFF0F1521),
    surfaceRaised: Color(0xFF172030),
    border: Color(0xFF242C3B),
    foreground: Color(0xFFFAFAFA),
    mutedForeground: Color(0xFFA1A1AA),
    accent: Color(0xFF10B981),
    accentGlow: Color(0xFF34D399),
    onAccent: Color(0xFF04140E),
    ai: Color(0xFF818CF8),
    warning: Color(0xFFF59E0B),
    danger: Color(0xFFFB7185),
    info: Color(0xFF38BDF8),
  );

  static const light = SmartSpendColors(
    brightness: Brightness.light,
    background: Color(0xFFF7F8FA),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFF1F3F6),
    border: Color(0xFFE4E4E7),
    foreground: Color(0xFF18181B),
    mutedForeground: Color(0xFF5F6068),
    accent: Color(0xFF047857),
    accentGlow: Color(0xFF10B981),
    onAccent: Color(0xFFFFFFFF),
    ai: Color(0xFF4F46E5),
    warning: Color(0xFFB45309),
    danger: Color(0xFFBE123C),
    info: Color(0xFF0369A1),
  );
}

/// Spacing on a 4-point grid.
abstract final class SmartSpendSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;

  /// The side margin of a screen.
  static const double screen = 20;
}

/// Corner radii.
abstract final class SmartSpendRadii {
  static const double sm = 10;
  static const double md = 16;
  static const double lg = 24;

  /// The top corners of a bottom sheet.
  static const double sheet = 28;
}
