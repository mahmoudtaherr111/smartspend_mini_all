import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../budgets/budgets_screen.dart';
import '../business/business_screen.dart';
import '../commitments/commitments_screen.dart';
import '../contacts/contacts_providers.dart';
import '../contacts/contacts_screen.dart';
import '../goals/goals_screen.dart';
import '../limits/limits_card.dart';
import '../notifications/notification_inbox_screen.dart';
import '../notifications/notification_providers.dart';
import '../plans/plan_screen.dart';
import '../support/help_center_screen.dart';
import '../wallets/wallet_providers.dart';
import '../wallets/wallets_screen.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';
import 'settings_screen.dart';

/// The More tab (MORE-01): who is signed in, whether bank messages arrive, and the money tools a person comes back
/// for, with their live figures. What is set once lives in [SettingsScreen].
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  static const path = '/more';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final unreadCount = ref.watch(unreadNotificationsCountProvider);
    final wallets = ref.watch(walletsProvider).value;
    final debts = ref.watch(peopleDebtsDataProvider).value;
    final netDebt = debts == null
        ? 0
        : debts.totalOwedToYou - debts.totalYouOwe;

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
            const BankCaptureCard(),
            const LimitsCard(onlyWhenLow: true),

            GroupedSection(
              title: l10n.moreMoneySection,
              children: [
                GroupedRow(
                  icon: Icons.account_balance_wallet_rounded,
                  title: l10n.walletsTitle,
                  subtitle: l10n.walletsEntry,
                  value: wallets == null || wallets.isEmpty
                      ? null
                      : AmountText(
                          wallets.fold<num>(
                            0,
                            (sum, wallet) => sum + wallet.balance,
                          ),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                  onTap: () => context.go(WalletsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.people_outline_rounded,
                  title: l10n.calPeopleAndDebts,
                  subtitle: l10n.calWhoOwesYouAndWho,
                  value: netDebt == 0
                      ? null
                      : DebtBadge(balance: netDebt, compact: true),
                  onTap: () => context.go(ContactsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.savings_outlined,
                  title: l10n.calMonthlyBudgets,
                  subtitle: l10n.calSetALimitAndSee,
                  onTap: () => context.go(BudgetsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.flag_outlined,
                  title: l10n.calSavingGoals,
                  subtitle: l10n.calPlanWhatYouAreSaving,
                  onTap: () => context.go(GoalsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.event_repeat_rounded,
                  title: l10n.cmTitle,
                  subtitle: l10n.cmMoreEntry,
                  onTap: () => context.push(CommitmentsScreen.path),
                ),
              ],
            ),

            GroupedSection(
              title: l10n.calPlanAndRewards,
              children: [
                GroupedRow(
                  icon: Icons.star_outline_rounded,
                  title: l10n.calMyPlan,
                  subtitle: l10n.calComparePlansAndManageYour,
                  onTap: () => context.go(PlanScreen.path),
                ),
                GroupedRow(
                  icon: Icons.storefront_outlined,
                  title: l10n.calWorkAccount,
                  subtitle: l10n.calKeepWorkSpendingApartFrom,
                  onTap: () => context.go(BusinessScreen.path),
                ),
              ],
            ),

            const SizedBox(height: SmartSpendSpacing.md),
            GroupedSection(
              children: [
                GroupedRow(
                  icon: Icons.settings_outlined,
                  title: l10n.settingsTitle,
                  subtitle: l10n.settingsEntry,
                  onTap: () => context.go(SettingsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.help_outline_rounded,
                  title: l10n.calHelpCenter,
                  subtitle: l10n.calCommonQuestionsAndSupportTickets,
                  onTap: () => context.go(HelpCenterScreen.path),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            const SignOutButton(),
          ],
        ),
      ),
    );
  }
}
