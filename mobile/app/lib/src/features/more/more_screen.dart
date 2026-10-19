import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../lock/security_screen.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';
import 'language_card.dart';

/// The More tab. For now it holds the account with its sign-out, security and privacy, the interface language,
/// and the bank message capture card, which shows the native bridge working on each platform.
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
          const SizedBox(height: SmartSpendSpacing.lg),
          Card(
            clipBehavior: Clip.antiAlias,
            child: ListTile(
              leading: const Icon(Icons.shield_outlined),
              title: Text(l10n.securityTitle),
              subtitle: Text(l10n.securityEntryBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go(SecurityScreen.path),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          const LanguageCard(),
          const SizedBox(height: SmartSpendSpacing.lg),
          const BankCaptureCard(),
        ],
      ),
    );
  }
}
