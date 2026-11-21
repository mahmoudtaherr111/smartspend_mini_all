import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../account/delete_account_sheet.dart';
import '../account/money_preferences_screen.dart';
import '../account/onboarding_questions_screen.dart';
import '../account/sessions_screen.dart';
import '../export/export_screen.dart';
import '../infrastructure/app_info_sheet.dart';
import '../infrastructure/appearance_sheet.dart';
import '../infrastructure/data_stored_screen.dart';
import '../infrastructure/terms_screen.dart';
import '../lock/security_screen.dart';
import '../notifications/notification_settings_screen.dart';
import 'language_card.dart';

/// What a person sets once and rarely opens again, so the More tab can hold only what they come back for.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  static const path = '/more/settings';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: SmartSpendSpacing.screen,
          vertical: SmartSpendSpacing.sm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GroupedSection(
              title: l10n.calNotificationsAndAppearance,
              children: [
                GroupedRow(
                  icon: Icons.notifications_active_outlined,
                  title: l10n.calNotificationSettings,
                  subtitle: l10n.calChooseWhatReachesYou,
                  onTap: () => context.push(NotificationSettingsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.palette_outlined,
                  title: l10n.calAppearance,
                  subtitle: l10n.calLightDarkOrLikeYour,
                  onTap: () => AppearanceSheet.show(context),
                ),
                const LanguageRow(),
              ],
            ),
            GroupedSection(
              title: l10n.calAccount,
              children: [
                GroupedRow(
                  icon: Icons.tune_rounded,
                  title: l10n.calMoneyPreferences,
                  subtitle: l10n.calWhenYourFinancialMonthStarts,
                  onTap: () => context.push(MoneyPreferencesScreen.path),
                ),
                GroupedRow(
                  icon: Icons.psychology_outlined,
                  title: l10n.calPersonalQuestions,
                  subtitle: l10n.calHelpTheAssistantUnderstandYou,
                  onTap: () => context.push(OnboardingQuestionsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.file_download_outlined,
                  title: l10n.calExportMyData,
                  subtitle: l10n.calDownloadACopyOfYour,
                  onTap: () => context.push(ExportScreen.path),
                ),
                GroupedRow(
                  icon: Icons.devices_rounded,
                  title: l10n.calSignedInDevices,
                  subtitle: l10n.calSeeAndSignOutYour,
                  onTap: () => context.push(SessionsScreen.path),
                ),
              ],
            ),
            GroupedSection(
              title: l10n.moreAppSection,
              children: [
                GroupedRow(
                  icon: Icons.shield_outlined,
                  title: l10n.securityTitle,
                  subtitle: l10n.securityEntryBody,
                  onTap: () => context.push(SecurityScreen.path),
                ),
                GroupedRow(
                  icon: Icons.folder_shared_outlined,
                  title: l10n.calWhatTheAppStoresAbout,
                  subtitle: l10n.calYourDataAndYourRights,
                  onTap: () => context.push(DataStoredScreen.path),
                ),
                GroupedRow(
                  icon: Icons.description_outlined,
                  title: l10n.calTermsAndPrivacy,
                  subtitle: l10n.calTermsOfUseAndPrivacy,
                  onTap: () => context.push(TermsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.info_outline_rounded,
                  title: l10n.calAboutSmartspend,
                  subtitle: l10n.calVersionAndLicenses,
                  onTap: () => AppInfoSheet.show(context),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            GroupedSection(
              children: [
                GroupedRow(
                  icon: Icons.person_remove_outlined,
                  title: l10n.calDeleteMyAccount,
                  subtitle: l10n.calDeleteYourDataForGood,
                  destructive: true,
                  onTap: () => DeleteAccountSheet.show(context),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
          ],
        ),
      ),
    );
  }
}
