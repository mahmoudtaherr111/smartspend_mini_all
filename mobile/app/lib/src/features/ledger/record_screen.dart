import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'ledger_providers.dart';
import 'ledger_widgets.dart';
import 'offline/outbox.dart';
import 'outbox_section.dart';
import 'record_composer.dart';
import 'transactions_screen.dart';

/// The record tab, the app's home: the month at a glance, the latest transactions by day, and the sentence box at
/// the bottom. Pulling down reloads it.
class RecordScreen extends ConsumerWidget {
  const RecordScreen({super.key});

  static const path = '/record';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final recent = ref.watch(recentEntriesProvider);
    final online = ref.watch(networkStatusProvider);
    // Its own messenger: notices raised here show on this scaffold, above the sentence box, instead of on the tab
    // shell's, where they would float over the box's send button.
    return ScaffoldMessenger(
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.navRecord)),
        body: Column(
          children: [
            if (!online) OfflineBanner(l10n.offlineBanner),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  await ref.read(outboxProvider.notifier).flush();
                  refreshLedger(ref);
                  await ref.read(monthSummaryProvider.future);
                },
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    SmartSpendSpacing.screen,
                    SmartSpendSpacing.sm,
                    SmartSpendSpacing.screen,
                    SmartSpendSpacing.xl,
                  ),
                  children: [
                    const MonthSummaryCard(),
                    const OutboxSection(),
                    SectionHeader(
                      l10n.recentTitle,
                      actionLabel: l10n.seeAll,
                      onAction: () => context.go(TransactionsScreen.path),
                    ),
                    switch (recent) {
                      AsyncData(:final value) when value.entries.isEmpty =>
                        EmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: l10n.ledgerEmptyTitle,
                          message: l10n.ledgerEmptyBody,
                        ),
                      AsyncData(:final value) => LedgerDayList(
                        entries: value.entries,
                      ),
                      AsyncError() => ErrorState(
                        message: l10n.ledgerLoadFailed,
                        retryLabel: l10n.retry,
                        onRetry: () => ref.invalidate(recentEntriesProvider),
                      ),
                      _ => const LedgerSkeleton(),
                    },
                  ],
                ),
              ),
            ),
          ],
        ),
        // In the bottom slot, notices float above the sentence box instead of covering its send button, and the
        // box still rises with the keyboard, which the tab shell's scaffold makes room for.
        bottomNavigationBar: const RecordComposer(),
      ),
    );
  }
}
