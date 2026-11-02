import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/preferences.dart';
import '../../l10n/app_localizations.dart';

/// Modal bottom sheet for choosing theme mode (System, Light, Dark) (ACC-08).
class AppearanceSheet extends ConsumerWidget {
  const AppearanceSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (ctx) => const AppearanceSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;

    final currentChoice = ref.watch(themeModeProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.appearanceTitle, style: textTheme.titleMedium),
            const SizedBox(height: SmartSpendSpacing.md),
            RadioGroup<ThemeChoice>(
              groupValue: currentChoice,
              onChanged: (choice) {
                if (choice != null) {
                  ref.read(themeModeProvider.notifier).choose(choice);
                  Navigator.of(context).pop();
                }
              },
              child: Column(
                children: [
                  RadioListTile<ThemeChoice>(
                    secondary: const Icon(Icons.brightness_auto_rounded),
                    title: Text(l10n.appearanceSystem),
                    value: ThemeChoice.system,
                  ),
                  RadioListTile<ThemeChoice>(
                    secondary: const Icon(Icons.light_mode_outlined),
                    title: Text(l10n.appearanceLight),
                    value: ThemeChoice.light,
                  ),
                  RadioListTile<ThemeChoice>(
                    secondary: const Icon(Icons.dark_mode_outlined),
                    title: Text(l10n.appearanceDark),
                    value: ThemeChoice.dark,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
