import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/category_style.dart';
import '../ledger/ledger_models.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/ledger_widgets.dart';
import 'stats_providers.dart';
import 'stats_screen.dart';

/// One category's transactions in a chosen month (STA-02 in .agents/mobile-program/features.json): its total for the
/// month as the hero, then its rows grouped by day, with swipe-to-delete and undo.
class CategoryTransactionsScreen extends ConsumerStatefulWidget {
  const CategoryTransactionsScreen({
    super.key,
    required this.category,
    this.month,
  });

  static const subPath = 'category';
  static const path = '${StatsScreen.path}/$subPath';

  static String pathFor(String category, {String? month}) => Uri(
    path: path,
    queryParameters: {'name': category, 'month': ?month},
  ).toString();

  final String category;
  final String? month;

  @override
  ConsumerState<CategoryTransactionsScreen> createState() =>
      _CategoryTransactionsScreenState();
}

class _CategoryTransactionsScreenState
    extends ConsumerState<CategoryTransactionsScreen> {
  /// Signed amount of rows currently hidden while their undo notice is still open.
  num _hiddenDelta = 0;

  void _delete(
    BuildContext context,
    CategoryMonthQuery query,
    LedgerEntry entry,
  ) {
    final l10n = AppLocalizations.of(context);
    final notifier = ref.read(categoryTransactionsProvider(query).notifier)
      ..hide(entry);
    setState(() => _hiddenDelta += entry.amount);
    var undone = false;
    SmartSpendHaptics.impact();
    showSmartSpendNotice(
      context,
      l10n.entryDeleted,
      undoLabel: l10n.undo,
      onUndo: () {
        undone = true;
        if (mounted) setState(() => _hiddenDelta -= entry.amount);
        notifier.restore(entry);
      },
    ).closed.then((_) async {
      if (undone) return;
      try {
        await ref.read(ledgerApiProvider).delete(entry.id);
        if (mounted) setState(() => _hiddenDelta -= entry.amount);
        ref
          ..invalidate(monthStatsByMonthProvider(query.month))
          ..invalidate(monthStatsProvider)
          ..invalidate(monthSummaryProvider)
          ..invalidate(recentEntriesProvider)
          ..invalidate(allEntriesProvider);
      } on Object {
        if (mounted) setState(() => _hiddenDelta -= entry.amount);
        notifier.restore(entry);
        if (context.mounted) {
          unawaited(SmartSpendHaptics.error());
          showSmartSpendNotice(context, l10n.deleteFailed);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    final resolvedMonth = widget.month ?? ref.watch(statsMonthProvider).value;
    final words = DateWords.of(context);

    if (resolvedMonth == null || widget.category.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(inlineName(widget.category))),
        body: const _Loading(),
      );
    }

    final query = (category: widget.category, month: resolvedMonth);
    final list = ref.watch(categoryTransactionsProvider(query));
    final stats = ref.watch(monthStatsByMonthProvider(resolvedMonth)).value;
    final fromStats = stats?.categories
        .where((item) => item.name == widget.category)
        .firstOrNull
        ?.amount;
    final monthLabel = words.month(resolvedMonth);

    Future<void> refresh() async {
      try {
        ref
          ..invalidate(monthStatsByMonthProvider(resolvedMonth))
          ..invalidate(categoryTransactionsProvider(query));
        await ref.read(categoryTransactionsProvider(query).future);
      } catch (_) {
        if (context.mounted) {
          showSmartSpendNotice(context, l10n.refreshFailedNotice);
        }
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(inlineName(widget.category))),
      body: Column(
        children: [
          if (!online) OfflineBanner(l10n.offlineBanner),
          Expanded(
            child: RefreshIndicator(
              onRefresh: refresh,
              child: NotificationListener<ScrollNotification>(
                onNotification: (notification) {
                  if (notification.metrics.extentAfter < 400) {
                    ref
                        .read(categoryTransactionsProvider(query).notifier)
                        .loadMore();
                  }
                  return false;
                },
                child: () {
                  final LedgerListState? value = list.value;
                  if (value != null) {
                    if (value.entries.isEmpty) {
                      return _Scrolling(
                        children: [
                          EmptyState(
                            icon: categoryIcon(widget.category),
                            title: l10n.statsCategoryEmptyTitle,
                            message: l10n.statsCategoryEmptyBody(
                              widget.category,
                              monthLabel,
                            ),
                          ),
                        ],
                      );
                    }
                    return _Scrolling(
                      children: [
                        StaggeredReveal(
                          children: [
                            _buildHero(l10n, monthLabel, value, fromStats),
                            LedgerDayList(
                              entries: value.entries,
                              onDelete: (entry) =>
                                  _delete(context, query, entry),
                            ),
                            if (value.loadingMore)
                              const LedgerSkeleton(rows: 2),
                          ],
                        ),
                      ],
                    );
                  }
                  if (list.hasError) {
                    return _Scrolling(
                      children: [
                        ErrorState(
                          message: switch (list.error) {
                            ApiException(:final message) => message,
                            _ => l10n.ledgerLoadFailed,
                          },
                          retryLabel: l10n.retry,
                          onRetry: () => ref.invalidate(
                            categoryTransactionsProvider(query),
                          ),
                        ),
                      ],
                    );
                  }
                  return const _Loading();
                }(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHero(
    AppLocalizations l10n,
    String monthLabel,
    LedgerListState value,
    num? fromStats,
  ) {
    final summed = value.entries.fold<num>(
      0,
      (sum, entry) => sum + entry.amount,
    );
    final net = fromStats != null ? (fromStats - _hiddenDelta) : summed;
    final refund = net < 0;
    return HeroFigure(
      label: refund
          ? l10n.statsCategoryRefundInMonth(monthLabel)
          : l10n.statsCategoryInMonth(monthLabel),
      amount: net.abs(),
      kind: refund ? AmountKind.income : AmountKind.neutral,
      story: l10n.summaryCount(value.total),
      wash: true,
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
      Skeleton(height: 148, radius: SmartSpendRadii.lg),
      SizedBox(height: SmartSpendSpacing.lg),
      LedgerSkeleton(rows: 5),
    ],
  );
}