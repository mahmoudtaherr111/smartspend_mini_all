import '../ledger/ledger_models.dart';

/// One balance row from `expense.getDebtBalances`.
final class DebtBalance {
  const DebtBalance({
    required this.name,
    required this.balance,
    required this.lent,
    required this.received,
    this.contactId,
    this.lastDate,
    this.count = 0,
  });

  factory DebtBalance.fromJson(Map<String, Object?> json) => DebtBalance(
    contactId: (json['contactId'] as num?)?.toInt(),
    name: json['name'] as String? ?? '',
    balance: readAmount(json['balance']) ?? 0,
    lent: readAmount(json['lent']) ?? 0,
    received: readAmount(json['received']) ?? 0,
    count: (json['count'] as num?)?.toInt() ?? 0,
    lastDate: switch (json['lastDate']) {
      final String value => DateTime.tryParse(value)?.toLocal(),
      _ => null,
    },
  );

  final int? contactId;
  final String name;
  final num balance;
  final num lent;
  final num received;
  final DateTime? lastDate;
  final int count;

  Map<String, Object?> toJson() => {
    'contactId': contactId,
    'name': name,
    'balance': balance,
    'lent': lent,
    'received': received,
    'count': count,
    if (lastDate != null) 'lastDate': lastDate!.toIso8601String(),
  };
}

/// The debts and loan standing of the user (`expense.getDebtBalances`).
final class DebtsSummary {
  const DebtsSummary({
    required this.balances,
    required this.owedToYou,
    required this.youOwe,
  });

  factory DebtsSummary.fromJson(Map<String, Object?> json) => DebtsSummary(
    balances: [
      for (final item in json['balances'] as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) DebtBalance.fromJson(item),
    ],
    owedToYou: readAmount(json['owedToYou']) ?? 0,
    youOwe: readAmount(json['youOwe']) ?? 0,
  );

  final List<DebtBalance> balances;
  final num owedToYou;
  final num youOwe;

  num get net => owedToYou - youOwe;

  Map<String, Object?> toJson() => {
    'balances': [for (final b in balances) b.toJson()],
    'owedToYou': owedToYou,
    'youOwe': youOwe,
  };
}

/// A person with their contact details and their calculated debt balance.
final class ContactDebtItem {
  const ContactDebtItem({
    required this.name,
    this.contactId,
    this.relation,
    this.balance = 0,
    this.transactionCount = 0,
    this.isSilenced = false,
  });

  final int? contactId;
  final String name;
  final String? relation;
  final num balance;
  final int transactionCount;
  final bool isSilenced;

  bool get isSettled => balance == 0;
}

/// The aggregated data view for the People & Debts screen.
final class PeopleDebtsData {
  const PeopleDebtsData({
    required this.activeDebts,
    required this.settledContacts,
    required this.totalOwedToYou,
    required this.totalYouOwe,
    this.isOffline = false,
  });

  final List<ContactDebtItem> activeDebts;
  final List<ContactDebtItem> settledContacts;
  final num totalOwedToYou;
  final num totalYouOwe;
  final bool isOffline;

  num get net => totalOwedToYou - totalYouOwe;
}
