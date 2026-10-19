import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/preferences.dart';
import '../../l10n/app_localizations.dart';

/// A language by its own name, as language pickers write it, whatever the interface language is.
String languageName(AppLocalizations l10n, AppLanguage language) =>
    switch (language) {
      AppLanguage.arabic => l10n.languageArabic,
      AppLanguage.english => l10n.languageEnglish,
    };

/// The interface language, in More: a sheet with the two languages and a reminder that recording stays Arabic.
class LanguageCard extends ConsumerWidget {
  const LanguageCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final language = ref.watch(languageProvider);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        leading: const Icon(Icons.translate),
        title: Text(l10n.languageTitle),
        subtitle: Text(languageName(l10n, language)),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => showSmartSpendSheet<void>(
          context: context,
          builder: (_) => const _LanguageSheet(),
        ),
      ),
    );
  }
}

class _LanguageSheet extends ConsumerWidget {
  const _LanguageSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final language = ref.watch(languageProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: SmartSpendSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.screen,
              ),
              child: Text(
                l10n.languageTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            RadioGroup<AppLanguage>(
              groupValue: language,
              onChanged: (choice) {
                if (choice == null) return;
                unawaited(ref.read(languageProvider.notifier).choose(choice));
                Navigator.of(context).pop();
              },
              child: Column(
                children: [
                  for (final option in AppLanguage.values)
                    RadioListTile<AppLanguage>(
                      value: option,
                      title: Text(languageName(l10n, option)),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.screen,
              ),
              child: Text(
                l10n.languageNote,
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(color: colors.mutedForeground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// On the sign-in screens: one tap to the other language, before any account exists.
class LanguageSwitchButton extends ConsumerWidget {
  const LanguageSwitchButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final other = ref.watch(languageProvider) == AppLanguage.arabic
        ? AppLanguage.english
        : AppLanguage.arabic;
    return Center(
      child: TextButton.icon(
        onPressed: () =>
            unawaited(ref.read(languageProvider.notifier).choose(other)),
        icon: const Icon(Icons.translate),
        label: Text(languageName(l10n, other)),
      ),
    );
  }
}
