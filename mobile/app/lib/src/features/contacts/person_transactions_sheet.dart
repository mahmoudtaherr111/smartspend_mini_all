import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_models.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/ledger_widgets.dart';
import '../ledger/transaction_detail_screen.dart';

/// Bottom sheet displaying transactions linked to one person.
class PersonTransactionsSheet extends ConsumerWidget {
  const PersonTransactionsSheet({
    required this.name,
    this.contactId,
    this.relation,
    super.key,
  });

  factory PersonTransactionsSheet.fromContact(ContactSummary contact) =>
      PersonTransactionsSheet(
        name: contact.name,
        contactId: contact.id,
        relation: contact.relation,
      );

  final String name;
  final int? contactId;
  final String? relation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final query = (contactId: contactId ?? 0, name: name);
    final entries = ref.watch(personTransactionsProvider(query));

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.personTransactionsTitle(inlineName(name)),
            style: textTheme.titleLarge,
          ),
          if (relation case final String rel when rel.trim().isNotEmpty) ...[
            const SizedBox(height: SmartSpendSpacing.xs / 2),
            Text(
              rel.trim(),
              style: textTheme.bodySmall?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          ],
          const SizedBox(height: SmartSpendSpacing.md),
          switch (entries) {
            AsyncData(:final value) when value.isEmpty => Padding(
              padding: const EdgeInsets.symmetric(
                vertical: SmartSpendSpacing.lg,
              ),
              child: Text(
                l10n.personTransactionsEmpty,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ),
            AsyncData(:final value) => LedgerDayList(
              entries: value,
              onEntryTap: (tapped, tag) {
                Navigator.of(context).pop();
                context.push(
                  TransactionDetailScreen.pathFor(tapped.id),
                  extra: TransactionDetailLaunch(entry: tapped, heroTag: tag),
                );
              },
            ),
            AsyncError() => ErrorState(
              message: l10n.ledgerLoadFailed,
              retryLabel: l10n.retry,
              onRetry: () => ref.invalidate(personTransactionsProvider(query)),
            ),
            _ => const LedgerSkeleton(rows: 3),
          },
        ],
      ),
    );
  }
}
