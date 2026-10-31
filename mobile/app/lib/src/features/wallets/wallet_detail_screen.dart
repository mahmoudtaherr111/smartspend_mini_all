import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/ledger_widgets.dart';
import 'wallet_form.dart';
import 'wallet_models.dart';
import 'wallet_providers.dart';
import 'wallets_screen.dart';

/// One wallet or card (MON-02, MON-03 in .agents/mobile-program/features.json): its balance as the hero with when it
/// was given, this month's money in and out as the server sums it (`wallet.getWalletMonth`), its latest
/// transactions, and editing or deleting it.
class WalletDetailScreen extends ConsumerWidget {
  const WalletDetailScreen({super.key, required this.walletId});

  static const path = ':walletId';

  static String pathFor(int id) => '${WalletsScreen.path}/$id';

  final int walletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    final detail = ref.watch(walletDetailProvider(walletId));
    final name = detail.value?.wallet.name;

    Future<void> refresh() async {
      ref.invalidate(walletsProvider);
      await ref
          .read(walletDetailProvider(walletId).future)
          .then((_) {}, onError: (Object _) {});
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(name == null ? l10n.walletsTitle : inlineName(name)),
      ),
      body: Column(
        children: [
          if (!online) OfflineBanner(l10n.offlineBanner),
          Expanded(
            child: RefreshIndicator(
              onRefresh: refresh,
              child: switch (detail) {
                AsyncData(value: null) => WalletsScrolling(
                  children: [
                    EmptyState(
                      icon: Icons.account_balance_wallet_outlined,
                      title: l10n.walletNotFound,
                      message: l10n.walletNotFoundBody,
                      actionLabel: l10n.walletsBack,
                      onAction: () => context.go(WalletsScreen.path),
                    ),
                  ],
                ),
                AsyncData(value: final WalletDetail value) => WalletsScrolling(
                  children: [_Filled(detail: value)],
                ),
                AsyncError(:final error) => WalletsScrolling(
                  children: [
                    ErrorState(
                      message: switch (error) {
                        ApiException(:final message) => message,
                        _ => l10n.walletsLoadFailed,
                      },
                      retryLabel: l10n.retry,
                      onRetry: () => ref.invalidate(walletsProvider),
                    ),
                  ],
                ),
                _ => const _Loading(),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Filled extends StatelessWidget {
  const _Filled({required this.detail});

  final WalletDetail detail;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final wallet = detail.wallet;
    final observed = wallet.balanceObservedAt;
    final when = observed == null
        ? null
        : DateWords.of(context).day(observed, now: clock.now());
    final label = [
      walletKindName(l10n, wallet.kind),
      if (wallet.lastFour != null)
        l10n.walletsLastFour(ltrIsolate(wallet.lastFour!)),
    ].join(' · ');

    Future<void> edit() async {
      final messenger = ScaffoldMessenger.of(context);
      if (await showWalletForm(context, wallet: wallet)) {
        messenger.showSnackBar(SnackBar(content: Text(l10n.walletSaved)));
      }
    }

    return StaggeredReveal(
      children: [
        HeroFigure(
          label: label,
          amount: wallet.balance,
          story: when == null
              ? l10n.walletBalanceStoryUnknown
              : l10n.walletBalanceStory(when),
          wash: true,
        ),
        StatTileRow(
          children: [
            StatTile(
              label: l10n.walletMonthIn,
              amount: detail.month.moneyIn,
              kind: AmountKind.income,
            ),
            StatTile(label: l10n.walletMonthOut, amount: detail.month.moneyOut),
          ],
        ),
        GroupedSection(
          children: [
            GroupedRow(
              icon: Icons.edit_rounded,
              title: l10n.walletEdit,
              // It opens a sheet over this screen, not another screen.
              trailing: const SizedBox.shrink(),
              onTap: edit,
            ),
            GroupedRow(
              icon: Icons.delete_outline_rounded,
              title: l10n.walletDelete,
              destructive: true,
              onTap: () => _confirmDelete(context, wallet),
            ),
          ],
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                l10n.walletRecent,
                style: textTheme.titleMedium?.copyWith(
                  color: colors.foreground,
                ),
              ),
            ),
            if (detail.transactions.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: SmartSpendSpacing.sm),
                child: Text(
                  l10n.walletNoTransactions,
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              )
            else
              LedgerDayList(entries: detail.transactions),
          ],
        ),
      ],
    );
  }
}

/// Asks before deleting: the sheet ends only in a choice, and deleting cannot be undone.
Future<void> _confirmDelete(BuildContext context, Wallet wallet) async {
  final l10n = AppLocalizations.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final router = GoRouter.of(context);
  final deleted = await showSmartSpendSheet<bool>(
    context: context,
    isDismissible: false,
    builder: (_) => _DeleteSheet(wallet: wallet),
  );
  if (deleted ?? false) {
    messenger.showSnackBar(SnackBar(content: Text(l10n.walletDeleted)));
    router.go(WalletsScreen.path);
  }
}

class _DeleteSheet extends ConsumerStatefulWidget {
  const _DeleteSheet({required this.wallet});

  final Wallet wallet;

  @override
  ConsumerState<_DeleteSheet> createState() => _DeleteSheetState();
}

class _DeleteSheetState extends ConsumerState<_DeleteSheet> {
  bool _busy = false;
  String? _error;

  Future<void> _delete() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(walletsRepositoryProvider).delete(widget.wallet.id);
      unawaited(SmartSpendHaptics.success());
      ref.invalidate(walletsProvider);
      // Its transactions now belong to no wallet.
      refreshLedger(ref);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on ApiNetworkException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final error = _error;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.walletDeleteTitle(inlineName(widget.wallet.name)),
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            l10n.walletDeleteBody,
            style: textTheme.bodyMedium?.copyWith(
              color: context.smartSpendColors.foreground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          if (error != null) ...[
            InlineMessage(error),
            const SizedBox(height: SmartSpendSpacing.md),
          ],
          SmartSpendButton(
            label: l10n.walletDeleteConfirm,
            variant: ButtonVariant.destructive,
            busy: _busy,
            onPressed: _delete,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: l10n.walletDeleteKeep,
            variant: ButtonVariant.secondary,
            onPressed: _busy ? null : () => Navigator.of(context).pop(false),
          ),
        ],
      ),
    );
  }
}

/// A skeleton of the filled detail: the hero, two tiles and the actions.
class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const WalletsScrolling(
    children: [
      Skeleton(height: 148, radius: SmartSpendRadii.lg),
      SizedBox(height: SmartSpendSpacing.lg),
      Row(
        children: [
          Expanded(child: Skeleton(height: 84, radius: SmartSpendRadii.lg)),
          SizedBox(width: SmartSpendSpacing.sm),
          Expanded(child: Skeleton(height: 84, radius: SmartSpendRadii.lg)),
        ],
      ),
      SizedBox(height: SmartSpendSpacing.lg),
      Skeleton(height: 120, radius: SmartSpendRadii.lg),
      SizedBox(height: SmartSpendSpacing.lg),
      LedgerSkeleton(rows: 3),
    ],
  );
}
