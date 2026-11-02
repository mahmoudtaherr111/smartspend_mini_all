import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../account/delete_account_sheet.dart';
import '../account/money_preferences_screen.dart';
import '../account/onboarding_questions_screen.dart';
import '../account/profile_screen.dart';
import '../account/sessions_screen.dart';
import '../budgets/budgets_screen.dart';
import '../business/business_screen.dart';
import '../contacts/contacts_screen.dart';
import '../export/export_screen.dart';
import '../goals/goals_screen.dart';
import '../infrastructure/app_info_sheet.dart';
import '../infrastructure/appearance_sheet.dart';
import '../infrastructure/data_stored_screen.dart';
import '../infrastructure/terms_screen.dart';
import '../installments/installments_screen.dart';
import '../limits/limits_card.dart';
import '../lock/security_screen.dart';
import '../notifications/notification_inbox_screen.dart';
import '../notifications/notification_providers.dart';
import '../notifications/notification_settings_screen.dart';
import '../plans/invite_friends_screen.dart';
import '../plans/plan_screen.dart';
import '../seasons/seasons_screen.dart';
import '../support/help_center_screen.dart';
import '../wallets/wallets_screen.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';
import 'language_card.dart';

/// The More tab (MORE-01): 6 grouped sections gathering account, money tools, plan,
/// app settings, security, and help in clean two-tap architecture.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  static const path = '/more';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final unreadCount = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navMore),
        actions: [
          IconButton(
            tooltip: l10n.notificationsTitle,
            icon: Badge(
              isLabelVisible: unreadCount > 0,
              label: Text('$unreadCount'),
              child: const Icon(Icons.notifications_outlined),
            ),
            onPressed: () => context.push(NotificationInboxScreen.path),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AccountCard(),
            const SizedBox(height: SmartSpendSpacing.md),

            // 1. Money Tools (GroupedSection: moreMoneySection)
            GroupedSection(
              title: l10n.moreMoneySection,
              children: [
                GroupedRow(
                  icon: Icons.account_balance_wallet_rounded,
                  title: l10n.walletsTitle,
                  subtitle: l10n.walletsEntry,
                  onTap: () => context.go(WalletsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.storefront_outlined,
                  title: AppLocalizations.of(context).calWorkAccount,
                  subtitle: AppLocalizations.of(context)
                      .calKeepWorkSpendingApartFrom,
                  onTap: () => context.go(BusinessScreen.path),
                ),
                GroupedRow(
                  icon: Icons.people_outline_rounded,
                  title: AppLocalizations.of(context).calPeopleAndDebts,
                  subtitle: AppLocalizations.of(context).calWhoOwesYouAndWho,
                  onTap: () => context.go(ContactsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.savings_outlined,
                  title: AppLocalizations.of(context).calMonthlyBudgets,
                  subtitle: AppLocalizations.of(context).calSetALimitAndSee,
                  onTap: () => context.go(BudgetsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.flag_outlined,
                  title: AppLocalizations.of(context).calSavingGoals,
                  subtitle: AppLocalizations.of(context)
                      .calPlanWhatYouAreSaving,
                  onTap: () => context.go(GoalsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.calendar_month_outlined,
                  title: AppLocalizations.of(context).calInstallments,
                  subtitle: AppLocalizations.of(context)
                      .calMonthlyInstallmentsAndWhatIs,
                  onTap: () => context.go(InstallmentsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.wb_sunny_outlined,
                  title: AppLocalizations.of(context).calSeasons,
                  subtitle: AppLocalizations.of(context)
                      .calRamadanFeastsSchoolAndSummer,
                  onTap: () => context.go(SeasonsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.file_download_outlined,
                  title: AppLocalizations.of(context).calExportMyData,
                  subtitle: AppLocalizations.of(context).calDownloadACopyOfYour,
                  onTap: () => context.go(ExportScreen.path),
                ),
              ],
            ),

            // 2. Account & Profile
            GroupedSection(
              title: AppLocalizations.of(context).calAccount,
              children: [
                GroupedRow(
                  icon: Icons.person_outline_rounded,
                  title: AppLocalizations.of(context).calProfile,
                  subtitle: AppLocalizations.of(context)
                      .calYourNameAndPhoneNumber,
                  onTap: () => context.go(ProfileScreen.path),
                ),
                GroupedRow(
                  icon: Icons.tune_rounded,
                  title: AppLocalizations.of(context).calMoneyPreferences,
                  subtitle: AppLocalizations.of(context)
                      .calWhenYourFinancialMonthStarts,
                  onTap: () => context.go(MoneyPreferencesScreen.path),
                ),
                GroupedRow(
                  icon: Icons.devices_rounded,
                  title: AppLocalizations.of(context).calSignedInDevices,
                  subtitle: AppLocalizations.of(context).calSeeAndSignOutYour,
                  onTap: () => context.go(SessionsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.psychology_outlined,
                  title: AppLocalizations.of(context).calPersonalQuestions,
                  subtitle: AppLocalizations.of(context)
                      .calHelpTheAssistantUnderstandYou,
                  onTap: () => context.go(OnboardingQuestionsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.person_remove_outlined,
                  title: AppLocalizations.of(context).calDeleteMyAccount,
                  subtitle: AppLocalizations.of(context)
                      .calDeleteYourDataForGood,
                  onTap: () => DeleteAccountSheet.show(context),
                ),
              ],
            ),

            // 3. Plans & Rewards
            GroupedSection(
              title: AppLocalizations.of(context).calPlanAndRewards,
              children: [
                GroupedRow(
                  icon: Icons.star_outline_rounded,
                  title: AppLocalizations.of(context).calMyPlan,
                  subtitle: AppLocalizations.of(context)
                      .calComparePlansAndManageYour,
                  onTap: () => context.go(PlanScreen.path),
                ),
                GroupedRow(
                  icon: Icons.card_giftcard_rounded,
                  title: AppLocalizations.of(context).calInviteFriends,
                  subtitle: AppLocalizations.of(context).calShareYourInviteCode,
                  onTap: () => context.go(InviteFriendsScreen.path),
                ),
              ],
            ),

            // 4. Security & Privacy (GroupedSection: moreAppSection)
            GroupedSection(
              title: l10n.moreAppSection,
              children: [
                GroupedRow(
                  icon: Icons.shield_outlined,
                  title: l10n.securityTitle,
                  subtitle: l10n.securityEntryBody,
                  onTap: () => context.go(SecurityScreen.path),
                ),
                GroupedRow(
                  icon: Icons.folder_shared_outlined,
                  title: AppLocalizations.of(context).calWhatTheAppStoresAbout,
                  subtitle: AppLocalizations.of(context)
                      .calYourDataAndYourRights,
                  onTap: () => context.go(DataStoredScreen.path),
                ),
                GroupedRow(
                  icon: Icons.description_outlined,
                  title: AppLocalizations.of(context).calTermsAndPrivacy,
                  subtitle: AppLocalizations.of(context)
                      .calTermsOfUseAndPrivacy,
                  onTap: () => context.go(TermsScreen.path),
                ),
                const LanguageRow(),
              ],
            ),

            // 5. Notifications & Preferences
            GroupedSection(
              title: AppLocalizations.of(context).calNotificationsAndAppearance,
              children: [
                GroupedRow(
                  icon: Icons.notifications_outlined,
                  title: AppLocalizations.of(context).calNotifications,
                  subtitle: AppLocalizations.of(context)
                      .calAlertsAboutYourTransactionsAnd,
                  trailing: unreadCount > 0 ? StatusTag('$unreadCount') : null,
                  onTap: () => context.push(NotificationInboxScreen.path),
                ),
                GroupedRow(
                  icon: Icons.notifications_active_outlined,
                  title: AppLocalizations.of(context).calNotificationSettings,
                  subtitle: AppLocalizations.of(context)
                      .calChooseWhatReachesYou,
                  onTap: () => context.push(NotificationSettingsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.palette_outlined,
                  title: AppLocalizations.of(context).calAppearance,
                  subtitle: AppLocalizations.of(context).calLightDarkOrLikeYour,
                  onTap: () => AppearanceSheet.show(context),
                ),
              ],
            ),

            // 6. Help & About
            GroupedSection(
              title: AppLocalizations.of(context).calHelp,
              children: [
                GroupedRow(
                  icon: Icons.help_outline_rounded,
                  title: AppLocalizations.of(context).calHelpCenter,
                  subtitle: AppLocalizations.of(context)
                      .calCommonQuestionsAndSupportTickets,
                  onTap: () => context.go(HelpCenterScreen.path),
                ),
                GroupedRow(
                  icon: Icons.info_outline_rounded,
                  title: AppLocalizations.of(context).calAboutSmartspend,
                  subtitle: AppLocalizations.of(context).calVersionAndLicenses,
                  onTap: () => AppInfoSheet.show(context),
                ),
              ],
            ),

            const SizedBox(height: SmartSpendSpacing.md),
            const LimitsCard(),
            const SizedBox(height: SmartSpendSpacing.md),
            const BankCaptureCard(),
          ],
        ),
      ),
    );
  }
}
