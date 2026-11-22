import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// Shown for the moment the app reads the stored session token, before it knows which screen to open.
class StartingScreen extends StatelessWidget {
  const StartingScreen({super.key});

  static const path = '/starting';

  @override
  Widget build(BuildContext context) {
    final dark = SmartSpendColors.dark;
    final darkTheme = SmartSpendTheme.dark();
    final title =
        Localizations.of<AppLocalizations>(
          context,
          AppLocalizations,
        )?.appTitle ??
        'SmartSpend';

    return Theme(
      data: darkTheme,
      child: Scaffold(
        backgroundColor: dark.background,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LogoBadge(label: title, color: dark.accent, size: 72),
              const SizedBox(height: SmartSpendSpacing.lg),
              Text(
                title,
                style: darkTheme.textTheme.headlineSmall?.copyWith(
                  color: dark.foreground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xl),
              SizedBox.square(
                dimension: SmartSpendSpacing.xl,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: dark.accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
