import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import 'wallet_detail_screen.dart';
import 'wallet_form.dart';
import 'wallet_models.dart';
import 'wallet_providers.dart';
import 'wallet_style.dart';

/// The wallets and cards (MON-01 in .agents/mobile-program/features.json): what is in them together as the hero,
/// then each one with its balance and when that balance was given. A row opens the wallet; the last row adds one.
class WalletsScreen extends ConsumerWidget {
  const WalletsScreen({super.key});

  static const path = '/more/wallets';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    final wallets = ref.watch(walletsProvider);

    Future<void> refresh() async {
      try {
        ref.invalidate(walletsProvider);
        await ref.read(walletsProvider.future);
      } catch (_) {
        if (context.mounted) {
          showSmartSpendNotice(context, l10n.refreshFailedNotice);
        }
      }
    }

    Future<void> add() async {
      final messenger = ScaffoldMessenger.of(context);
      if (await showWalletForm(context)) {
        messenger.showSnackBar(SnackBar(content: Text(l10n.walletSaved)));
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.walletsTitle)),
      body: Column(
        children: [
          if (!online) OfflineBanner(l10n.offlineBanner),
          Expanded(
            child: RefreshIndicator(
              onRefresh: refresh,
              child: () {
                final List<Wallet>? list = wallets.value;
                if (list != null) {
                  if (list.isEmpty) {
                    return WalletsScrolling(
                      children: [
                        EmptyState(
                          icon: Icons.account_balance_wallet_rounded,
                          title: l10n.walletsEmptyTitle,
                          message: l10n.walletsEmptyBody,
                          actionLabel: l10n.walletsAdd,
                          onAction: add,
                        ),
                      ],
                    );
                  }
                  return WalletsScrolling(
                    children: [
                      StaggeredReveal(
                        children: [
                          HeroFigure(
                            label: l10n.walletsTotal,
                            amount: list.fold<num>(
                              0,
                              (num sum, Wallet wallet) => sum + wallet.balance,
                            ),
                            story: l10n.walletsTotalStory,
                            wash: true,
                          ),
                          GroupedSection(
                            children: [
                              for (final wallet in list)
                                _WalletRow(wallet: wallet),
                              GroupedRow(
                                icon: Icons.add_rounded,
                                title: l10n.walletsAdd,
                                trailing: const SizedBox.shrink(),
                                onTap: add,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  );
                }
                if (wallets.hasError) {
                  return WalletsScrolling(
                    children: [
                      ErrorState(
                        message: switch (wallets.error) {
                          ApiException(:final message) => message,
                          _ => l10n.walletsLoadFailed,
                        },
                        retryLabel: l10n.retry,
                        onRetry: () => ref.invalidate(walletsProvider),
                      ),
                    ],
                  );
                }
                return const _Loading();
              }(),
            ),
          ),
        ],
      ),
    );
  }
}

class _WalletRow extends StatelessWidget {
  const _WalletRow({required this.wallet});

  final Wallet wallet;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final observed = wallet.balanceObservedAt;
    final details = [
      if (wallet.lastFour != null)
        l10n.walletsLastFour(ltrIsolate(wallet.lastFour!)),
      if (observed != null)
        l10n.walletUpdated(
          DateWords.of(context).day(observed, now: clock.now()),
        )
      else
        l10n.walletUpdatedUnknown,
    ];
    return GroupedRow(
      icon: wallet.kind.icon,
      tint: walletKindColor(context, wallet.kind),
      title: inlineName(wallet.name),
      subtitle: details.join(' · '),
      value: AmountText(
        wallet.balance,
        style: Theme.of(context).textTheme.titleMedium,
      ),
      onTap: () => context.go(WalletDetailScreen.pathFor(wallet.id)),
    );
  }
}

/// The wallet screens' content scrolls, and can always be pulled to refresh, even when it is short.
class WalletsScrolling extends StatelessWidget {
  const WalletsScrolling({super.key, required this.children});

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

/// A skeleton of the filled list: the hero and three rows.
class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const WalletsScrolling(
    children: [
      Skeleton(height: 148, radius: SmartSpendRadii.lg),
      SizedBox(height: SmartSpendSpacing.lg),
      Skeleton(height: 200, radius: SmartSpendRadii.lg),
    ],
  );
}
