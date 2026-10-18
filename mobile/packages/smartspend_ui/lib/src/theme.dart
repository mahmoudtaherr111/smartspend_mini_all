import 'package:flutter/material.dart';

import 'tokens.dart';
import 'typography.dart';

/// The SmartSpend [ThemeData] for each brightness, built from [SmartSpendColors].
abstract final class SmartSpendTheme {
  static ThemeData dark() => _build(SmartSpendColors.dark);

  static ThemeData light() => _build(SmartSpendColors.light);

  static ThemeData _build(SmartSpendColors c) {
    final scheme = ColorScheme(
      brightness: c.brightness,
      primary: c.accent,
      onPrimary: c.onAccent,
      secondary: c.ai,
      onSecondary: c.background,
      error: c.danger,
      onError: Colors.white,
      surface: c.surface,
      onSurface: c.foreground,
      onSurfaceVariant: c.mutedForeground,
      surfaceContainerLowest: c.background,
      surfaceContainerLow: c.surface,
      surfaceContainer: c.surface,
      surfaceContainerHigh: c.surfaceRaised,
      surfaceContainerHighest: c.surfaceRaised,
      outline: c.border,
      outlineVariant: c.border,
      surfaceTint: Colors.transparent,
    );

    TextStyle navLabel(Set<WidgetState> states) {
      final selected = states.contains(WidgetState.selected);
      return SmartSpendTypography.style(
        12,
        selected ? FontWeight.w700 : FontWeight.w500,
      ).copyWith(color: selected ? c.accent : c.mutedForeground);
    }

    return ThemeData(
      useMaterial3: true,
      brightness: c.brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      fontFamily: SmartSpendTypography.fontFamily,
      textTheme: SmartSpendTypography.textTheme(c.foreground),
      dividerTheme: DividerThemeData(color: c.border, thickness: 1),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SmartSpendRadii.md),
          side: BorderSide(color: c.border),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        foregroundColor: c.foreground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: SmartSpendTypography.style(
          20,
          FontWeight.w700,
        ).copyWith(color: c.foreground),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.accent.withValues(alpha: 0.16),
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(navLabel),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? c.accent
                : c.mutedForeground,
          ),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surface,
        modalBackgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: c.mutedForeground.withValues(alpha: 0.4),
        modalBarrierColor: Colors.black.withValues(alpha: 0.6),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(SmartSpendRadii.sheet),
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          textStyle: SmartSpendTypography.style(16, FontWeight.w700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(SmartSpendRadii.md),
          ),
        ),
      ),
      extensions: [SmartSpendColorsTheme(c)],
    );
  }
}

/// Carries [SmartSpendColors] in the theme, for the colours Material's scheme has no slot for.
final class SmartSpendColorsTheme
    extends ThemeExtension<SmartSpendColorsTheme> {
  const SmartSpendColorsTheme(this.colors);

  final SmartSpendColors colors;

  @override
  SmartSpendColorsTheme copyWith({SmartSpendColors? colors}) =>
      SmartSpendColorsTheme(colors ?? this.colors);

  @override
  SmartSpendColorsTheme lerp(SmartSpendColorsTheme? other, double t) =>
      other != null && t >= 0.5 ? other : this;
}

extension SmartSpendThemeContext on BuildContext {
  /// The SmartSpend colours of the current theme.
  SmartSpendColors get smartSpendColors =>
      Theme.of(this).extension<SmartSpendColorsTheme>()?.colors ??
      SmartSpendColors.dark;
}
