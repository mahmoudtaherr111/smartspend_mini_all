import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';

/// The More tab. For now it holds the account with its sign-out, and the bank message capture card, which shows
/// the native bridge working on each platform.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).navMore)),
      body: ListView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: const [
          AccountCard(),
          SizedBox(height: SmartSpendSpacing.lg),
          BankCaptureCard(),
        ],
      ),
    );
  }
}
