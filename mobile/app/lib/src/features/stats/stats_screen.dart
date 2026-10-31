import 'dart:math' as math;

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/category_style.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/record_screen.dart';
import 'category_transactions_screen.dart';
import 'stats_models.dart';
import 'stats_providers.dart';

/// The stats tab (STA-01, STA-02 in .agents/mobile-program/features.json): the month's spending as one hero figure
/// with how it compares, two small figures, where the money went (tapping any category opens its transactions for the
/// month), and the month's habits in sentences. Every figure is the server's (`expense.getMonthlyStats`); the month
/// moves with the switcher.
class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  static const path = '/stats';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    final month = ref.watch(statsMonthProvider).value;
    final stats = ref.watch(monthStatsProvider);
    final offset = ref.watch(statsMonthOffsetProvider);
    final words = DateWords.of(context);

    Future<void> refresh() async {
      if (month != null) {
        ref.invalidate(monthStatsByMonthProvider(month));
      }
      ref.invalidate(monthStatsProvider);
      // A failed refresh shows its error state; the indicator only waits for the answer.
      await ref
          .read(monthStatsProvider.future)
          .then((_) {}, onError: (Object _) {});
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navStats)),
      body: Column(
        children: [
          if (!online) OfflineBanner(l10n.offlineBanner),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: SmartSpendSpacing.sm,
            ),
            child: MonthSwitcher(
              label: month == null ? '' : words.month(month),
              previousTooltip: l10n.statsPreviousMonth,
              nextTooltip: l10n.statsNextMonth,
              onPrevious: () =>
                  ref.read(statsMonthOffsetProvider.notifier).previous(),
              onNext: offset == 0
                  ? null
                  : () => ref.read(statsMonthOffsetProvider.notifier).next(),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: refresh,
              child: switch (stats) {
                AsyncData(:final value) when value.isEmpty => _Scrolling(
                  children: [
                    EmptyState(
                      icon: Icons.insights_rounded,
                      title: l10n.statsEmptyTitle(
                        month == null ? '' : words.monthName(month),
                      ),
                      message: l10n.statsEmptyBody,
                      actionLabel: l10n.statsEmptyAction,
                      onAction: () => context.go(RecordScreen.path),
                    ),
                  ],
                ),
                AsyncData(:final value) => _Scrolling(
                  children: _filled(context, l10n, value, month),
                ),
                AsyncError(:final error) => _Scrolling(
                  children: [
                    ErrorState(
                      message: switch (error) {
                        ApiException(:final message) => message,
                        _ => l10n.statsLoadFailed,
                      },
                      retryLabel: l10n.retry,
                      onRetry: () {
                        if (month != null) {
                          ref.invalidate(monthStatsByMonthProvider(month));
                        }
                        ref.invalidate(monthStatsProvider);
                      },
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

  List<Widget> _filled(
    BuildContext context,
    AppLocalizations l10n,
    MonthStats stats,
    String? month,
  ) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final words = DateWords.of(context);
    final change = stats.changePercent;
    final story = switch ((change, stats.comparison)) {
      (null, _) => l10n.statsNoComparison,
      (0, _) => l10n.statsSameAsLastMonth,
      (final c?, Comparison.monthly) when c < 0 => l10n.statsLessThanLastMonth(
        _percent(-c),
      ),
      (final c?, Comparison.monthly) => l10n.statsMoreThanLastMonth(
        _percent(c),
      ),
      (final c?, Comparison.weekly) when c < 0 => l10n.statsLessThanLastWeek(
        _percent(-c),
      ),
      (final c?, Comparison.weekly) => l10n.statsMoreThanLastWeek(_percent(c)),
    };
    final habits = <String>[
      if (stats.topDay != null && stats.topDayAmount != null)
        l10n.statsTopDay(
          words.day(stats.topDay!, now: clock.now()),
          moneyText(context, stats.topDayAmount!),
        ),
      if (stats.mostRecurring != null && (stats.mostRecurringCount ?? 0) > 1)
        l10n.statsMostRecurring(
          stats.mostRecurring!,
          stats.mostRecurringCount!,
        ),
    ];

    return [
      StaggeredReveal(
        children: [
          HeroFigure(
            label: l10n.summarySpentIn(
              month == null ? '' : words.monthName(month),
            ),
            amount: stats.expense,
            story: story,
            wash: true,
          ),
          StatTileRow(
            children: [
              StatTile(
                label: l10n.statsDailyAverage,
                amount: stats.dailyAverage,
              ),
              StatTile(
                label: l10n.summaryIncome,
                amount: stats.income,
                kind: AmountKind.income,
              ),
            ],
          ),
          if (stats.categories.any((c) => c.amount != 0))
            GroupedCard(
              title: l10n.statsByCategory,
              child: ProportionBar(
                maxRows: math.max(6, stats.categories.length),
                otherLabel: l10n.statsOther,
                refundLabel: l10n.statsRefund,
                onPartTap: (part) => context.go(
                  CategoryTransactionsScreen.pathFor(part.label, month: month),
                ),
                parts: [
                  for (final category in stats.categories)
                    ProportionPart(
                      label: category.name,
                      amount: category.amount,
                      color: categoryColor(context, category.name),
                    ),
                ],
              ),
            ),
          if (habits.isNotEmpty)
            GroupedCard(
              title: l10n.statsHabits,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final sentence in habits)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: SmartSpendSpacing.xs,
                      ),
                      child: Text(
                        sentence,
                        style: textTheme.bodyLarge?.copyWith(
                          color: colors.foreground,
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    ];
  }
}

/// A percentage kept in one left-to-right run, so its sign stays after the digits in Arabic text too.
String _percent(int value) => ltrIsolate('$value%');

/// The tab's content scrolls, and can always be pulled to refresh, even when it is short.
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

/// A skeleton of the filled layout: the hero, tiles, the category bar and its rows.
class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => _Scrolling(
    children: [
      const Skeleton(height: 168, radius: SmartSpendRadii.lg),
      const SizedBox(height: SmartSpendSpacing.lg),
      const Row(
        children: [
          Expanded(child: Skeleton(height: 84, radius: SmartSpendRadii.lg)),
          SizedBox(width: SmartSpendSpacing.sm),
          Expanded(child: Skeleton(height: 84, radius: SmartSpendRadii.lg)),
          SizedBox(width: SmartSpendSpacing.sm),
          Expanded(child: Skeleton(height: 84, radius: SmartSpendRadii.lg)),
        ],
      ),
      const SizedBox(height: SmartSpendSpacing.lg),
      const Skeleton(height: 260, radius: SmartSpendRadii.lg),
    ],
  );
}
