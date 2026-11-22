import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// Terms of Service Viewer (ACC-11, GAP-45).
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  static const path = '/more/terms';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.termsTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Section(
              title: l10n.termsSectionUsageTitle,
              content: l10n.termsSectionUsageBody,
            ),
            _Section(
              title: l10n.termsSectionAiTitle,
              content: l10n.termsSectionAiBody,
            ),
            _Section(
              title: l10n.termsSectionPrivacyTitle,
              content: l10n.termsSectionPrivacyBody,
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.content});

  final String title;
  final String content;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: textTheme.titleMedium?.copyWith(color: colors.accent),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            content,
            style: textTheme.bodyMedium?.copyWith(
              height: 1.6,
              color: colors.foreground,
            ),
          ),
        ],
      ),
    );
  }
}
