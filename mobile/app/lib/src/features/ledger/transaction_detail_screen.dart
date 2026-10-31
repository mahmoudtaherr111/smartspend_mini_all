import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../wallets/wallet_detail_screen.dart';
import '../wallets/wallet_models.dart';
import '../wallets/wallet_providers.dart';
import '../wallets/wallet_style.dart';
import 'category_style.dart';
import 'edit_transaction_sheet.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'ledger_widgets.dart';
import 'record_screen.dart';

/// Optional launch context passed via `GoRouter`'s `extra` when tapping a [TransactionRow]: carries the preloaded
/// [entry] and its [heroTag] so the shared-element flight lands smoothly while `expense.getById` refreshes.
final class TransactionDetailLaunch {
  const TransactionDetailLaunch({this.entry, this.heroTag});

  final LedgerEntry? entry;
  final Object? heroTag;
}

/// One transaction's full view (REC-08, MON-03 in .agents/mobile-program/features.json): its amount on the hero wash
/// (read in words by the screen reader), category, date and time, linked wallet or person, note, how it was recorded
/// and its original sentence, plus editing (REC-07) and undoable deletion.
class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({
    super.key,
    required this.entryId,
    this.initialEntry,
    this.heroTag,
  });

  static const path = '/transaction/:entryId';

  static String pathFor(int id) => '/transaction/$id';

  final int entryId;
  final LedgerEntry? initialEntry;
  final Object? heroTag;

  static void _goBack(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(RecordScreen.path);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    final detail = ref.watch(transactionDetailProvider(entryId));
    final hiddenIds = ref.watch(hiddenEntryIdsProvider);

    Future<void> refresh() async {
      try {
        ref.invalidate(transactionDetailProvider(entryId));
        await ref.read(transactionDetailProvider(entryId).future);
      } catch (_) {
        if (context.mounted) {
          showSmartSpendNotice(context, l10n.refreshFailedNotice);
        }
      }
    }

    final Widget body = () {
      final LedgerEntry? entry =
          detail.value ?? (!online ? initialEntry : null);
      if (entry != null) {
        if (hiddenIds.contains(entryId)) {
          return _Scrolling(
            children: [
              EmptyState(
                icon: Icons.receipt_long_rounded,
                title: l10n.transactionNotFoundTitle,
                message: l10n.transactionNotFoundBody,
                actionLabel: l10n.transactionBack,
                onAction: () => _goBack(context),
              ),
            ],
          );
        }
        return _Scrolling(
          children: [_Filled(entry: entry, online: online, heroTag: heroTag)],
        );
      }
      if (detail.hasValue && detail.value == null) {
        return _Scrolling(
          children: [
            EmptyState(
              icon: Icons.receipt_long_rounded,
              title: l10n.transactionNotFoundTitle,
              message: l10n.transactionNotFoundBody,
              actionLabel: l10n.transactionBack,
              onAction: () => _goBack(context),
            ),
          ],
        );
      }
      if (detail.hasError) {
        return _Scrolling(
          children: [
            ErrorState(
              message: switch (detail.error) {
                ApiException(:final message) when message.isNotEmpty => message,
                _ => l10n.transactionLoadFailed,
              },
              retryLabel: l10n.retry,
              onRetry: () =>
                  ref.invalidate(transactionDetailProvider(entryId)),
            ),
          ],
        );
      }
      if (initialEntry != null) {
        return _Scrolling(
          children: [
            _Filled(entry: initialEntry!, online: online, heroTag: heroTag),
          ],
        );
      }
      return const _Loading();
    }();

    return Scaffold(
      appBar: AppBar(
        leading: context.canPop()
            ? null
            : BackButton(onPressed: () => _goBack(context)),
        title: Text(l10n.transactionTitle),
      ),
      body: Column(
        children: [
          if (!online) OfflineBanner(l10n.offlineBanner),
          Expanded(
            child: RefreshIndicator(onRefresh: refresh, child: body),
          ),
        ],
      ),
    );
  }
}

class _Filled extends ConsumerWidget {
  const _Filled({required this.entry, required this.online, this.heroTag});

  final LedgerEntry entry;
  final bool online;
  final Object? heroTag;

  String _kindWord(AppLocalizations l10n) {
    if (entry.isRefund) return l10n.transactionKindRefund;
    return switch (entry.type) {
      'income' => l10n.transactionKindIncome,
      'transfer' => l10n.transactionKindTransfer,
      'investment' => l10n.transactionKindInvestment,
      _ => l10n.transactionKindExpense,
    };
  }

  (IconData, String)? _sourceInfo(AppLocalizations l10n, String? source) =>
      switch (source) {
        'ai_parsed' => (
          Icons.chat_bubble_outline_rounded,
          l10n.transactionSourceTyped,
        ),
        'manual' => (Icons.edit_note_rounded, l10n.transactionSourceManual),
        'voice' => (Icons.mic_rounded, l10n.transactionSourceVoice),
        'sms' => (Icons.sms_rounded, l10n.transactionSourceSms),
        'image' => (Icons.receipt_rounded, l10n.transactionSourceImage),
        _ => null,
      };

  Future<void> _edit(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final saved = await showEditTransactionSheet(context, entry: entry);
    if (saved && context.mounted) {
      showSmartSpendNotice(context, l10n.editSaved);
    }
  }

  void _delete(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final api = ref.read(ledgerApiProvider);
    final navigator = Navigator.of(context);

    container.read(hiddenEntryIdsProvider.notifier).hide(entry.id);
    container.read(allEntriesProvider.notifier).hide(entry);
    unawaited(SmartSpendHaptics.impact());

    var undone = false;
    TransactionDetailScreen._goBack(context);
    if (!navigator.mounted) return;

    showSmartSpendNotice(
      navigator.context,
      l10n.entryDeleted,
      undoLabel: l10n.undo,
      onUndo: () {
        undone = true;
        container.read(hiddenEntryIdsProvider.notifier).restore(entry.id);
        container.read(allEntriesProvider.notifier).restore(entry);
      },
    ).closed.then((_) async {
      if (undone) return;
      try {
        await api.delete(entry.id);
        container.read(hiddenEntryIdsProvider.notifier).restore(entry.id);
        invalidateLedgerContainer(container);
      } on Object {
        container.read(hiddenEntryIdsProvider.notifier).restore(entry.id);
        container.read(allEntriesProvider.notifier).restore(entry);
        if (navigator.mounted) {
          unawaited(SmartSpendHaptics.error());
          showSmartSpendNotice(navigator.context, l10n.deleteFailed);
        }
      }
    });
  }

  void _openPerson(BuildContext context, ContactSummary contact) {
    showSmartSpendSheet<void>(
      context: context,
      builder: (_) => _PersonTransactionsSheet(contact: contact),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final words = DateWords.of(context);
    final now = clock.now();
    final hidden = MoneyPrivacy.hiddenOf(context);
    final wallets = ref.watch(walletsProvider).value ?? const <Wallet>[];
    final contacts =
        ref.watch(contactsProvider).value ?? const <ContactSummary>[];

    final wallet = entry.walletId == null
        ? null
        : wallets.where((w) => w.id == entry.walletId).firstOrNull;
    final contact = entry.contactId == null
        ? null
        : contacts.where((c) => c.id == entry.contactId).firstOrNull;

    final sub = entry.subCategory?.trim();
    final categorySubtitle = sub != null && sub.isNotEmpty && sub != 'عام'
        ? '${entry.category} · $sub'
        : entry.category;
    final dateText =
        '${words.day(entry.date, now: now)} · ${inlineName(words.clock(entry.date))}';
    final description = entry.description?.trim();
    final rawText = entry.rawText?.trim();
    final sourceInfo = _sourceInfo(l10n, entry.source);

    Widget iconTile = CategoryTile(category: entry.category);
    if (heroTag != null && SmartSpendMotion.enabledOf(context)) {
      iconTile = Hero(tag: (heroTag!, 'icon'), child: iconTile);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        HeroFigure(
          label: '${_kindWord(l10n)} · ${inlineName(entry.title)}',
          amount: entry.amount.abs(),
          kind: entryKind(entry),
          story: dateText,
          wash: true,
          leading: iconTile,
          amountHeroTag: heroTag == null ? null : (heroTag!, 'amount'),
        ),
        const SizedBox(height: SmartSpendSpacing.md),
        GroupedSection(
          title: l10n.transactionDetailsSection,
          children: [
            GroupedRow(
              icon: categoryIcon(entry.category),
              tint: categoryColor(context, entry.category),
              title: l10n.transactionCategoryLabel,
              subtitle: categorySubtitle,
            ),
            GroupedRow(
              icon: Icons.schedule_rounded,
              title: l10n.transactionDateLabel,
              subtitle: dateText,
            ),
            if (entry.walletId != null)
              GroupedRow(
                icon: wallet?.kind.icon ?? Icons.account_balance_wallet_rounded,
                tint: wallet == null
                    ? colors.mutedForeground
                    : walletKindColor(context, wallet.kind),
                title: l10n.transactionWalletLabel,
                subtitle: wallet == null
                    ? l10n.transactionWalletUnknown
                    : inlineName(wallet.name),
                onTap: wallet == null
                    ? null
                    : () => context.go(
                        WalletDetailScreen.pathFor(entry.walletId!),
                      ),
              ),
            if (entry.contactId != null)
              GroupedRow(
                icon: Icons.person_rounded,
                title: l10n.transactionPersonLabel,
                subtitle: contact == null
                    ? l10n.transactionPersonUnknown
                    : [
                        inlineName(contact.name),
                        if (contact.relation != null &&
                            contact.relation!.trim().isNotEmpty)
                          contact.relation!.trim(),
                      ].join(' · '),
                onTap: contact == null
                    ? null
                    : () => _openPerson(context, contact),
              ),
            if (description != null && description.isNotEmpty)
              GroupedRow(
                icon: Icons.notes_rounded,
                title: l10n.transactionNoteLabel,
                subtitle: inlineName(
                  hidden ? maskDigits(description) : description,
                ),
              ),
            if (sourceInfo != null)
              GroupedRow(
                icon: sourceInfo.$1,
                title: l10n.transactionSourceLabel,
                subtitle: sourceInfo.$2,
              ),
            if (rawText != null && rawText.isNotEmpty)
              GroupedRow(
                icon: Icons.format_quote_rounded,
                title: l10n.transactionSentenceLabel,
                subtitle: '«${hidden ? maskDigits(rawText) : rawText}»',
              ),
          ],
        ),
        if (!online) ...[
          const SizedBox(height: SmartSpendSpacing.lg),
          InlineMessage(l10n.transactionEditOffline, warning: true),
        ],
        GroupedSection(
          children: [
            GroupedRow(
              icon: Icons.edit_rounded,
              title: l10n.transactionEditAction,
              subtitle: online ? null : l10n.transactionEditOffline,
              tint: online ? colors.accent : colors.mutedForeground,
              trailing: const SizedBox.shrink(),
              onTap: online ? () => _edit(context) : null,
            ),
            GroupedRow(
              icon: Icons.delete_outline_rounded,
              title: l10n.transactionDeleteAction,
              subtitle: online ? null : l10n.transactionDeleteOffline,
              tint: online ? null : colors.mutedForeground,
              destructive: online,
              trailing: online ? null : const SizedBox.shrink(),
              onTap: online ? () => _delete(context, ref) : null,
            ),
          ],
        ),
      ],
    );
  }
}

class _PersonTransactionsSheet extends ConsumerWidget {
  const _PersonTransactionsSheet({required this.contact});

  final ContactSummary contact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final query = (contactId: contact.id, name: contact.name);
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
            l10n.personTransactionsTitle(inlineName(contact.name)),
            style: textTheme.titleLarge,
          ),
          if (contact.relation case final String relation
              when relation.trim().isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              relation.trim(),
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

class _Scrolling extends StatelessWidget {
  const _Scrolling({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(
      SmartSpendSpacing.screen,
      SmartSpendSpacing.sm,
      SmartSpendSpacing.screen,
      SmartSpendSpacing.xxl,
    ),
    children: children,
  );
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const _Scrolling(
    children: [
      Skeleton(height: 152, radius: SmartSpendRadii.lg),
      SizedBox(height: SmartSpendSpacing.lg),
      Skeleton(height: 260, radius: SmartSpendRadii.lg),
      SizedBox(height: SmartSpendSpacing.lg),
      Skeleton(height: 120, radius: SmartSpendRadii.lg),
    ],
  );
}
