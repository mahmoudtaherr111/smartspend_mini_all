import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'ledger_widgets.dart';

/// Every transaction, newest first, a page at a time as the person scrolls. A row swiped away disappears at once,
/// and is deleted on the server only when its notice closes without an undo (rule 7.5: undo instead of asking).
class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  static const path = '/record/transactions';

  void _delete(BuildContext context, WidgetRef ref, LedgerEntry entry) {
    final l10n = AppLocalizations.of(context);
    final notifier = ref.read(allEntriesProvider.notifier)..hide(entry);
    var undone = false;
    SmartSpendHaptics.impact();
    showSmartSpendNotice(
      context,
      l10n.entryDeleted,
      undoLabel: l10n.undo,
      onUndo: () {
        undone = true;
        notifier.restore(entry);
      },
    ).closed.then((_) async {
      if (undone) return;
      try {
        await ref.read(ledgerApiProvider).delete(entry.id);
        ref
          ..invalidate(monthSummaryProvider)
          ..invalidate(recentEntriesProvider);
      } on Object {
        notifier.restore(entry);
        if (context.mounted) {
          unawaited(SmartSpendHaptics.error());
          showSmartSpendNotice(context, l10n.deleteFailed);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final list = ref.watch(allEntriesProvider);
    final hiddenIds = ref.watch(hiddenEntryIdsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.transactionsTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(allEntriesProvider.future),
        child: NotificationListener<ScrollNotification>(
          onNotification: (notification) {
            if (notification.metrics.extentAfter < 400) {
              ref.read(allEntriesProvider.notifier).loadMore();
            }
            return false;
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              SmartSpendSpacing.screen,
              0,
              SmartSpendSpacing.screen,
              SmartSpendSpacing.xl,
            ),
            children: [
              switch (list) {
                AsyncData(:final value)
                    when value.entries
                        .where((e) => !hiddenIds.contains(e.id))
                        .isEmpty =>
                  EmptyState(
                    icon: Icons.receipt_long_rounded,
                    title: l10n.ledgerEmptyTitle,
                    message: l10n.ledgerEmptyBody,
                  ),
                AsyncData(:final value) => Column(
                  children: [
                    LedgerDayList(
                      entries: value.entries,
                      onDelete: (entry) => _delete(context, ref, entry),
                    ),
                    if (value.loadingMore) const LedgerSkeleton(rows: 2),
                  ],
                ),
                AsyncError() => ErrorState(
                  message: l10n.ledgerLoadFailed,
                  retryLabel: l10n.retry,
                  onRetry: () => ref.invalidate(allEntriesProvider),
                ),
                _ => const LedgerSkeleton(rows: 6),
              },
            ],
          ),
        ),
      ),
    );
  }
}
