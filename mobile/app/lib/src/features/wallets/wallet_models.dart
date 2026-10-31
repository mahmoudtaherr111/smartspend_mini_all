import 'package:flutter/material.dart';

import '../ledger/ledger_models.dart' show readAmount;

/// The kinds of wallet and card the website offers (`src/components/wallets/DigitalBankingSuite.tsx`), stored as
/// the `provider` of `user_wallets`. Unknown kinds from the server are shown as a bank card.
enum WalletKind {
  card('Visa', Icons.credit_card_rounded, Color(0xFF64748B)),
  vodafoneCash('VodafoneCash', Icons.phone_iphone_rounded, Color(0xFFE11D48)),
  instaPay('InstaPay', Icons.bolt_rounded, Color(0xFF9333EA)),
  cib('CIB', Icons.account_balance_rounded, Color(0xFF1D4ED8)),
  nbe('NBE', Icons.account_balance_rounded, Color(0xFF047857)),
  banqueMisr('BanqueMisr', Icons.account_balance_rounded, Color(0xFFB91C1C)),
  qnb('QNB', Icons.account_balance_rounded, Color(0xFF7E22CE)),
  fawry('Fawry', Icons.storefront_rounded, Color(0xFFCA8A04)),
  orangeCash('OrangeMoney', Icons.phone_iphone_rounded, Color(0xFFEA580C)),
  etisalatCash('EtisalatCash', Icons.phone_iphone_rounded, Color(0xFF65A30D));

  const WalletKind(this.provider, this.icon, this.color);

  /// The value the server keeps.
  final String provider;
  final IconData icon;
  final Color color;

  static WalletKind of(String provider) => values.firstWhere(
    (kind) => kind.provider == provider,
    orElse: () => card,
  );
}

/// One wallet or card (`wallet.getWallets`). The balance is what the person typed, or what the assistant recorded,
/// at [balanceObservedAt]; older rows do not say when.
final class Wallet {
  const Wallet({
    required this.id,
    required this.name,
    required this.kind,
    required this.balance,
    this.lastFour,
    this.balanceObservedAt,
    String? provider,
  }) : provider = provider ?? '';

  factory Wallet.fromJson(Map<String, Object?> json) {
    final provider = json['provider'] as String? ?? '';
    return Wallet(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      kind: WalletKind.of(provider),
      balance: readAmount(json['balance']) ?? 0,
      lastFour: switch (json['lastFourDigits']) {
        final String digits when digits.isNotEmpty => digits,
        _ => null,
      },
      balanceObservedAt: switch (json['balanceObservedAt']) {
        final String at => DateTime.tryParse(at)?.toLocal(),
        _ => null,
      },
      provider: provider,
    );
  }

  final int id;
  final String name;
  final WalletKind kind;
  final num balance;
  final String? lastFour;
  final DateTime? balanceObservedAt;
  final String provider;

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'provider': provider.isEmpty ? kind.provider : provider,
    'balance': balance,
    'lastFourDigits': lastFour,
    'balanceObservedAt': balanceObservedAt?.toUtc().toIso8601String(),
  };
}

/// A wallet's money in and out over one month (`wallet.getWalletMonth`), summed by the server.
final class WalletMonth {
  const WalletMonth({
    required this.moneyIn,
    required this.moneyOut,
    required this.count,
  });

  factory WalletMonth.fromJson(Map<String, Object?> json) => WalletMonth(
    moneyIn: readAmount(json['moneyIn']) ?? 0,
    moneyOut: readAmount(json['moneyOut']) ?? 0,
    count: (json['count'] as num?)?.toInt() ?? 0,
  );

  final num moneyIn;
  final num moneyOut;
  final int count;
}
