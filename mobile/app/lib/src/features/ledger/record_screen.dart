import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../lock/app_lock.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'ledger_widgets.dart';
import 'manual_record_sheet.dart';
import 'offline/outbox.dart';
import 'outbox_section.dart';
import 'pending_questions_card.dart';
import 'record_composer.dart';
import 'transaction_search_screen.dart';
import 'transactions_screen.dart';

/// The record tab, the app's home: the month at a glance, waiting questions (REC-09), the outbox, the latest
/// transactions by day, and the sentence box at the bottom. Pulling down reloads it.
class RecordScreen extends ConsumerWidget {
  const RecordScreen({super.key});

  static const path = '/record';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final recent = ref.watch(recentEntriesProvider);
    final hiddenIds = ref.watch(hiddenEntryIdsProvider);
    final online = ref.watch(networkStatusProvider);
    final hidden = ref.watch(
      appLockProvider.select((lock) => lock.hideAmounts),
    );
    // Its own messenger: notices raised here show on this scaffold, above the sentence box, instead of on the tab
    // shell's, where they would float over the box's send button.
    return ScaffoldMessenger(
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.navRecord),
          actions: [
            // Record by hand (REC-12)
            IconButton(
              tooltip: l10n.manualRecordTitle,
              icon: const Icon(Icons.add_rounded),
              onPressed: () => showManualRecordSheet(context),
            ),
            // Search transactions (REC-11)
            IconButton(
              tooltip: l10n.searchTitle,
              icon: const Icon(Icons.search_rounded),
              onPressed: () => context.push(TransactionSearchScreen.path),
            ),
            // Amounts out of sight in one tap, for a phone someone else can see.
            IconButton(
              tooltip: hidden ? l10n.showAmounts : l10n.hideAmounts,
              icon: Icon(
                hidden
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
              ),
              onPressed: () =>
                  ref.read(appLockProvider.notifier).setHideAmounts(!hidden),
            ),
          ],
        ),
        body: Column(
          children: [
            if (!online) OfflineBanner(l10n.offlineBanner),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  try {
                    await ref.read(outboxProvider.notifier).flush();
                    refreshLedger(ref);
                    await ref.read(monthSummaryProvider.future);
                  } catch (_) {
                    if (context.mounted) {
                      showSmartSpendNotice(context, l10n.refreshFailedNotice);
                    }
                  }
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(
                    SmartSpendSpacing.screen,
                    SmartSpendSpacing.sm,
                    SmartSpendSpacing.screen,
                    SmartSpendSpacing.xl,
                  ),
                  children: [
                    StaggeredReveal(
                      sessionKey: 'tab-record',
                      spacing: 0,
                      children: [
                        const MonthSummaryCard(),
                        const PendingQuestionsCard(),
                        const OutboxSection(),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SectionHeader(
                              l10n.recentTitle,
                              actionLabel: l10n.seeAll,
                              onAction: () =>
                                  context.go(TransactionsScreen.path),
                            ),
                            () {
                              final LedgerPage? value = recent.value;
                              if (value != null) {
                                if (value.entries
                                    .where((LedgerEntry e) =>
                                        !hiddenIds.contains(e.id))
                                    .isEmpty) {
                                  return EmptyState(
                                    icon: Icons.receipt_long_rounded,
                                    title: l10n.ledgerEmptyTitle,
                                    message: l10n.ledgerEmptyBody,
                                  );
                                }
                                return LedgerDayList(
                                  entries: value.entries,
                                );
                              }
                              if (recent.hasError) {
                                return ErrorState(
                                  message: l10n.ledgerLoadFailed,
                                  retryLabel: l10n.retry,
                                  onRetry: () =>
                                      ref.invalidate(recentEntriesProvider),
                                );
                              }
                              return const LedgerSkeleton();
                            }(),
                          ],
                        ),
                      ],
                    ),
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
