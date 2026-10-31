import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import '../ledger/ledger_providers.dart';
import 'contact_models.dart';
import 'contacts_api.dart';

final contactsApiProvider = Provider<ContactsApi>((ref) {
  return ContactsApi(ref.watch(trpcClientProvider));
});

/// The raw debt balances and totals from `expense.getDebtBalances`.
final debtsSummaryProvider = FutureProvider<DebtsSummary>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session is! SignedIn) {
    return const DebtsSummary(balances: [], owedToYou: 0, youOwe: 0);
  }

  try {
    final summary = await ref.watch(contactsApiProvider).getDebtBalances();
    ref.read(networkStatusProvider.notifier).reached();
    return summary;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    return const DebtsSummary(balances: [], owedToYou: 0, youOwe: 0);
  }
});

/// Combined People & Debts data view:
/// Merges contacts with debt balances, groups into active open debts vs settled contacts.
final peopleDebtsDataProvider = FutureProvider<PeopleDebtsData>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session is! SignedIn) {
    return const PeopleDebtsData(
      activeDebts: [],
      settledContacts: [],
      totalOwedToYou: 0,
      totalYouOwe: 0,
    );
  }

  final api = ref.watch(contactsApiProvider);
  try {
    final (contactsList, debtsSummary) = await (
      api.listContacts(),
      api.getDebtBalances(),
    ).wait;

    ref.read(networkStatusProvider.notifier).reached();

    final balanceByContactId = <int, DebtBalance>{};
    final balanceByName = <String, DebtBalance>{};
    for (final b in debtsSummary.balances) {
      if (b.contactId != null) {
        balanceByContactId[b.contactId!] = b;
      } else {
        balanceByName[b.name.trim()] = b;
      }
    }

    final activeDebts = <ContactDebtItem>[];
    final settledContacts = <ContactDebtItem>[];
    final seenContactIds = <int>{};
    final seenNames = <String>{};

    for (final c in contactsList) {
      seenContactIds.add(c.id);
      seenNames.add(c.name.trim());
      final debt = balanceByContactId[c.id] ?? balanceByName[c.name.trim()];
      final balance = debt?.balance ?? 0;
      final item = ContactDebtItem(
        contactId: c.id,
        name: c.name,
        relation: c.relation,
        balance: balance,
        transactionCount: c.transactionCount,
      );

      if (balance != 0) {
        activeDebts.add(item);
      } else {
        settledContacts.add(item);
      }
    }

    // Add any open balances that don't match a known contact
    for (final b in debtsSummary.balances) {
      if (b.contactId != null && seenContactIds.contains(b.contactId)) continue;
      if (seenNames.contains(b.name.trim())) continue;
      if (b.balance != 0) {
        activeDebts.add(
          ContactDebtItem(
            contactId: b.contactId,
            name: b.name,
            balance: b.balance,
            transactionCount: b.count,
          ),
        );
      }
    }

    // Sort active debts by absolute balance descending
    activeDebts.sort((a, b) => b.balance.abs().compareTo(a.balance.abs()));
    // Sort settled contacts by transaction count descending, then name
    settledContacts.sort((a, b) {
      final cmp = b.transactionCount.compareTo(a.transactionCount);
      if (cmp != 0) return cmp;
      return a.name.compareTo(b.name);
    });

    return PeopleDebtsData(
      activeDebts: activeDebts,
      settledContacts: settledContacts,
      totalOwedToYou: debtsSummary.owedToYou,
      totalYouOwe: debtsSummary.youOwe,
    );
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    // Return empty fallback with offline flag
    return const PeopleDebtsData(
      activeDebts: [],
      settledContacts: [],
      totalOwedToYou: 0,
      totalYouOwe: 0,
      isOffline: true,
    );
  }
});

void invalidateContactsAndDebts(WidgetRef ref) {
  ref
    ..invalidate(peopleDebtsDataProvider)
    ..invalidate(debtsSummaryProvider)
    ..invalidate(contactsProvider);
  refreshLedger(ref);
}
