import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../lock/security_screen.dart';
import '../wallets/wallets_screen.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';
import 'language_card.dart';

/// The More tab: the account with its sign-out, then the person's money (wallets and cards), then the app itself
/// (security and privacy, the interface language), and the bank message capture card, which shows the native bridge
/// working on each platform.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.navMore)),
      body: ListView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: [
          const AccountCard(),
          GroupedSection(
            title: l10n.moreMoneySection,
            children: [
              GroupedRow(
                icon: Icons.account_balance_wallet_rounded,
                title: l10n.walletsTitle,
                subtitle: l10n.walletsEntry,
                onTap: () => context.go(WalletsScreen.path),
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
              const LanguageRow(),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          const BankCaptureCard(),
        ],
      ),
    );
  }
}
