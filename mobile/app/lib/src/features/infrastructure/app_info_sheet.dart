import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// App Info Sheet displaying version, build info, and update checks (FND-11, FND-13).
class AppInfoSheet extends StatelessWidget {
  const AppInfoSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (ctx) => const AppInfoSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: colors.accent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
                    ),
                    child: Icon(
                      Icons.wallet_rounded,
                      color: colors.accent,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.md),
                  Text('SmartSpend AI', style: textTheme.titleLarge),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                side: BorderSide(color: colors.border),
              ),
              child: Column(
                children: [
                  ListTile(
                    title: Text(AppLocalizations.of(context).appTermsOfService),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/more/terms');
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    title: Text(AppLocalizations.of(context).appDataAndPrivacy),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/more/data-stored');
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            Text(
              AppLocalizations.of(context).app2026SmartspendAiEgypt,
              style: textTheme.bodySmall?.copyWith(
                color: colors.mutedForeground,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
