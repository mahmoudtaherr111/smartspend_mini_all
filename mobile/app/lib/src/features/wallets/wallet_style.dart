import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'wallet_models.dart';

/// How a wallet kind looks and reads on any screen: the wallet list, a wallet's detail, and a transaction's detail.
/// Kept apart from the form so other features can show a wallet without depending on its editing sheet.

/// The name a person reads for a wallet kind.
String walletKindName(AppLocalizations l10n, WalletKind kind) => switch (kind) {
  WalletKind.card => l10n.walletKindCard,
  WalletKind.vodafoneCash => l10n.walletKindVodafoneCash,
  WalletKind.instaPay => l10n.walletKindInstaPay,
  WalletKind.cib => l10n.walletKindCib,
  WalletKind.nbe => l10n.walletKindNbe,
  WalletKind.banqueMisr => l10n.walletKindBanqueMisr,
  WalletKind.qnb => l10n.walletKindQnb,
  WalletKind.fawry => l10n.walletKindFawry,
  WalletKind.orangeCash => l10n.walletKindOrangeCash,
  WalletKind.etisalatCash => l10n.walletKindEtisalatCash,
};

/// The kind's colour, darkened on the light theme so it reads on white.
Color walletKindColor(BuildContext context, WalletKind kind) =>
    context.smartSpendColors.brightness == Brightness.light
    ? Color.lerp(kind.color, Colors.black, 0.2)!
    : kind.color;
