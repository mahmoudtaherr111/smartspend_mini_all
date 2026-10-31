import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../budgets/budgets_screen.dart';
import '../contacts/contacts_screen.dart';
import '../export/export_screen.dart';
import '../goals/goals_screen.dart';
import '../installments/installments_screen.dart';
import '../limits/limits_card.dart';
import '../lock/security_screen.dart';
import '../seasons/seasons_screen.dart';
import '../wallets/wallets_screen.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';
import 'language_card.dart';

/// The More tab: the account with its sign-out, then the person's money (wallets and cards), then the app itself
/// (security and privacy, the interface language), and the bank message capture card, which shows the native bridge
/// working on each platform.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  static const path = '/more';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.navMore)),
      body: ListView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: [
          const AccountCard(),
          const SizedBox(height: SmartSpendSpacing.md),
          const BankCaptureCard(),
          const LimitsCard(),
          const SizedBox(height: SmartSpendSpacing.md),
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
                icon: Icons.people_outline_rounded,
                title: 'الناس والديون',
                subtitle: 'مين ليك عنده ومين عليك ليه',
                onTap: () => context.go(ContactsScreen.path),
              ),
              GroupedRow(
                icon: Icons.savings_outlined,
                title: 'الميزانيات الشهرية',
                subtitle: 'حدد سقف لمصاريفك وتابع اللي باقي لك أول بأول',
                onTap: () => context.go(BudgetsScreen.path),
              ),
              GroupedRow(
                icon: Icons.flag_outlined,
                title: 'أهداف التوفير',
                subtitle: 'خطط لمستقبلك وتابع وصولك لأهدافك بالذكاء الاصطناعي',
                onTap: () => context.go(GoalsScreen.path),
              ),
              GroupedRow(
                icon: Icons.calendar_month_outlined,
                title: 'الأقساط',
                subtitle: 'متابعة الأقساط الشهرية والباقي منها',
                onTap: () => context.go(InstallmentsScreen.path),
              ),
              GroupedRow(
                icon: Icons.wb_sunny_outlined,
                title: 'مواسم المصاريف',
                subtitle: 'رمضان، الأعياد، المدارس ومصاريف الصيف',
                onTap: () => context.go(SeasonsScreen.path),
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
                onTap: () => context.go(SecurityScreen.path),
              ),
              GroupedRow(
                icon: Icons.file_download_outlined,
                title: 'تصدير البيانات',
                subtitle: 'نزّل نسخة من كل معاملاتك المالية',
                onTap: () => context.go(ExportScreen.path),
              ),
              const LanguageRow(),
            ],
          ),
        ],
      ),
    );
  }
}
