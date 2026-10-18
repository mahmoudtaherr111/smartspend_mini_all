import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../l10n/app_localizations.dart';

/// Stands in for a tab whose screen the milestones of docs/decisions/0022-flutter-mobile-app.md have not
/// built yet.
class InProgressScreen extends StatelessWidget {
  const InProgressScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Text(
            AppLocalizations.of(context).screenInProgress,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge
                ?.copyWith(color: colors.mutedForeground),
          ),
        ),
      ),
    );
  }
}
