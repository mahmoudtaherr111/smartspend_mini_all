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
      scrollable: true,
      builder: (ctx) => const AppInfoSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
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
                Text(l10n.appTitle, style: textTheme.titleLarge),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  l10n.appInfoVersionValue('1.0.0+1'),
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
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
                  title: Text(l10n.appTermsOfService),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).pop();
                    context.push('/more/terms');
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  title: Text(l10n.appDataAndPrivacy),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).pop();
                    context.push('/more/data-stored');
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  title: Text(l10n.appInfoLicensesAction),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    showLicensePage(
                      context: context,
                      applicationName: l10n.appTitle,
                      applicationVersion: '1.0.0+1',
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          Text(
            l10n.app2026SmartspendAiEgypt,
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
