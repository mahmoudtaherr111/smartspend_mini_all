import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// Data Stored & Privacy Disclosure Screen (ACC-12, GAP-45).
class DataStoredScreen extends StatelessWidget {
  const DataStoredScreen({super.key});

  static const path = '/more/data-stored';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.dataStoredTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.md),
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                border: Border.all(color: colors.accent.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield_rounded, color: colors.accent, size: 32),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Text(
                      AppLocalizations.of(context).appThisPageExplainsWhatThe,
                      style: textTheme.labelMedium?.copyWith(height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            _Item(
              icon: Icons.cloud_outlined,
              title: l10n.dataStoredSectionServerTitle,
              body: l10n.dataStoredSectionServerBody,
            ),
            _Item(
              icon: Icons.phone_android_rounded,
              title: l10n.dataStoredSectionPhoneTitle,
              body: l10n.dataStoredSectionPhoneBody,
            ),
            _Item(
              icon: Icons.verified_user_outlined,
              title: l10n.dataStoredSectionDeleteTitle,
              body: l10n.dataStoredSectionDeleteBody,
            ),
          ],
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.md),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SmartSpendRadii.md),
          side: BorderSide(color: colors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: colors.accent, size: 24),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(title, style: textTheme.titleSmall),
                    const SizedBox(height: SmartSpendSpacing.xs),
                    Text(
                      body,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
