import 'dart:math' as math;

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../budgets/budget_providers.dart';
import '../budgets/budgets_screen.dart';
import '../contacts/contacts_screen.dart';
import '../ledger/category_style.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/record_screen.dart';
import '../ledger/transaction_search_screen.dart';
import '../seasons/seasons_screen.dart';
import 'category_transactions_screen.dart';
import 'stats_models.dart';
import 'stats_providers.dart';

/// The stats tab (STA-01..STA-12): the month's spending as one hero figure with how it compares,
/// small figures, category breakdown, spending personality & behavior (STA-07, STA-08), weekday spending
/// rollup bar chart (STA-03), budget vs spending (STA-04, GAP-15), debts rollup (STA-05), electronic payments
/// (STA-06, STA-10), year in review line chart with gaps (STA-09, GAP-18), and smart profile summary (STA-11).
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
      try {
        if (month != null) {
          ref.invalidate(monthStatsByMonthProvider(month));
        }
        ref.invalidate(monthStatsProvider);
        ref.invalidate(debtsOverviewProvider);
        ref.invalidate(budgetComparisonProvider);
        ref.invalidate(smartProfileSummaryProvider);
        await ref.read(monthStatsProvider.future);
      } catch (_) {
        if (context.mounted) {
          showSmartSpendNotice(context, l10n.refreshFailedNotice);
        }
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navStats),
        actions: [
          IconButton(
            tooltip: l10n.searchTitle,
            icon: const Icon(Icons.search_rounded),
            onPressed: () => context.push(TransactionSearchScreen.path),
          ),
        ],
      ),
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
              child: () {
                final MonthStats? value = stats.value;
                if (value != null) {
                  if (value.isEmpty) {
                    return _Scrolling(
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
                    );
                  }
                  return _Scrolling(
                    children: _filled(context, l10n, value, month),
                  );
                }
                if (stats.hasError) {
                  return _Scrolling(
                    children: [
                      ErrorState(
                        message: switch (stats.error) {
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

    final currentYear = month != null
        ? month.split('-').first
        : DateTime.now().year.toString();

    return [
      StaggeredReveal(
        sessionKey: 'tab-stats',
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

          _NextStepCard(stats: stats),

          // Where the money went (category breakdown)
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

          // STA-04, GAP-15: Budget comparison
          const _BudgetComparisonSection(),

          // STA-07, STA-08: Spending personality & behavior
          _SpendingPersonalitySection(stats: stats),

          // STA-03: Weekday spending rollup bar chart
          _WeekdaySpendingSection(stats: stats),

          // What the big seasons cost, beside the months they fall in
          GroupedSection(
            children: [
              GroupedRow(
                icon: Icons.wb_sunny_outlined,
                title: l10n.calSeasons,
                subtitle: l10n.calRamadanFeastsSchoolAndSummer,
                onTap: () => context.go(SeasonsScreen.path),
              ),
            ],
          ),

          // STA-06, STA-10: Electronic & bank message spending
          if (stats.automatedExpense > 0 || stats.automatedIncome > 0)
            _ElectronicPaymentsSection(stats: stats),

          // Habits
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

          // STA-05: Debts rollup (فلوس مع الناس)
          const _DebtsOverviewSection(),

          // STA-09, GAP-18: Year in review line chart with gaps
          _YearlyReviewSection(year: currentYear),

          // STA-11: Smart profile summary badge & Law 151 note
          const _SmartProfileSection(),
        ],
      ),
    ];
  }
}

/// A percentage kept in one left-to-right run, so its sign stays after the digits in Arabic text too.
String _percent(int value) => ltrIsolate('$value%');

/// Spending personality & behavior insights section (STA-07, STA-08).
class _SpendingPersonalitySection extends StatelessWidget {
  const _SpendingPersonalitySection({required this.stats});

  final MonthStats stats;

  @override
  Widget build(BuildContext context) {
    final labelAr = stats.spendingBehaviorLabelAr;
    if (labelAr == null || labelAr.isEmpty) return const SizedBox.shrink();

    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final explanation = _behaviorExplanation(context, stats.spendingBehavior);

    return GroupedCard(
      title: AppLocalizations.of(context).monHowYouSpend,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.sm,
                  vertical: SmartSpendSpacing.xs,
                ),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  border: Border.all(color: colors.accent.withAlpha(80)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.auto_awesome_rounded,
                      size: 16,
                      color: colors.accent,
                    ),
                    const SizedBox(width: SmartSpendSpacing.xs),
                    Text(
                      labelAr,
                      style: textTheme.labelLarge?.copyWith(
                        color: colors.accent,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            explanation,
            style: textTheme.bodyMedium?.copyWith(color: colors.foreground),
          ),
          if (stats.count < 5) ...[
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(
              AppLocalizations.of(context).monRecordMoreThisMonthTo,
              style: textTheme.bodySmall?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _behaviorExplanation(
    BuildContext context,
    String? behavior,
  ) => switch (behavior) {
    'spiky' => AppLocalizations.of(context).monYourSpendingJumpsOnCertain,
    'emotional' => AppLocalizations.of(context).monYourSpendingRisesOnWeekends,
    'concentrated' => AppLocalizations.of(context).monMostOfYourSpendingGoes,
    'impulsive' => AppLocalizations.of(
      context,
    ).monFrequentPurchasesWithoutPlanning,
    'conservative' => AppLocalizations.of(context).monYouSpendCautiouslyAndKeep,
    'planned' => AppLocalizations.of(context).monYouStickToYourBudget,
    _ => AppLocalizations.of(context).monYourSpendingIsBalancedWith,
  };
}

/// Weekday spending rollup bar chart (STA-03).
class _WeekdaySpendingSection extends StatelessWidget {
  const _WeekdaySpendingSection({required this.stats});

  final MonthStats stats;

  static const _arabicWeekdays = [
    'السبت',
    'الأحد',
    'الإثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    // The server names days in Arabic; these keys read its answer, the interface shows its own language.
    String label(String day) => DateWords.of(context)
        .weekdays[const [5, 6, 0, 1, 2, 3, 4][_arabicWeekdays.indexOf(day)]];

    final amountsMap = <String, num>{};
    for (final pt in stats.dayOfWeekTrend) {
      amountsMap[pt.name] = pt.amount;
    }

    // Determine top spending weekday
    String? topDayName;
    num topDayAmount = 0;
    for (final day in _arabicWeekdays) {
      final amt = amountsMap[day] ?? 0;
      if (amt > topDayAmount) {
        topDayAmount = amt;
        topDayName = day;
      }
    }

    final title = topDayName != null && topDayAmount > 0
        ? AppLocalizations.of(context).monYourBiggestSpendingDayP0(
            label(topDayName),
            moneyText(context, topDayAmount),
          )
        : AppLocalizations.of(context).monYourSpendingByWeekday;

    final barData = [
      for (final day in _arabicWeekdays)
        BarDataPoint(
          label: label(day),
          value: amountsMap[day] ?? 0,
          isHighlighted: day == topDayName && topDayAmount > 0,
        ),
    ];

    final hasAnyData = barData.any((p) => p.value > 0);
    if (!hasAnyData && stats.count == 0) return const SizedBox.shrink();

    return GroupedCard(
      title: AppLocalizations.of(context).monSpendingDays,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SmartSpendBarChart(
            title: title,
            data: barData,
            spokenSummary: topDayName != null
                ? AppLocalizations.of(context).monChartOfSpendingByWeekday(
                    label(topDayName),
                    moneyText(context, topDayAmount),
                  )
                : AppLocalizations.of(context).monChartOfSpendingByWeekday2,
            accentColor: colors.accent,
          ),
          if (stats.count < 5) ...[
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(
              AppLocalizations.of(context).monRecordMoreToSeeYour,
              style: textTheme.bodySmall?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Budget against spending comparison section (STA-04, GAP-15).
class _BudgetComparisonSection extends ConsumerWidget {
  const _BudgetComparisonSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comparisonAsync = ref.watch(budgetComparisonProvider);
    final comparison = comparisonAsync.value;
    if (comparison == null) return const SizedBox.shrink();

    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    if (comparison.fallbackKind == BudgetFallbackKind.none) {
      return GroupedCard(
        title: AppLocalizations.of(context).monMonthlyBudget,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              AppLocalizations.of(context).monSetAMonthlyBudgetTo,
              style: textTheme.bodyMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton.tonal(
                onPressed: () => context.go(BudgetsScreen.path),
                child: Text(AppLocalizations.of(context).monSetABudget),
              ),
            ),
          ],
        ),
      );
    }

    final isExceeded = comparison.isExceeded;
    final barColor = isExceeded ? colors.danger : colors.accent;

    final subtitle = switch (comparison.fallbackKind) {
      BudgetFallbackKind.budget =>
        comparison.title ??
            AppLocalizations.of(context).monOverallMonthlyBudget,
      BudgetFallbackKind.profileIncome => AppLocalizations.of(
        context,
      ).monComparedWithYourRecordedMonthly,
      BudgetFallbackKind.monthIncome => AppLocalizations.of(
        context,
      ).monComparedWithThisMonthS,
      BudgetFallbackKind.none => '',
    };

    return GroupedCard(
      title: AppLocalizations.of(context).monBudgetAndSpending,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  subtitle,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
              Text(
                '${comparison.percentage}%',
                style: textTheme.titleMedium?.copyWith(color: barColor),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
            child: LinearProgressIndicator(
              value: (comparison.percentage / 100).clamp(0.0, 1.0),
              minHeight: 10,
              backgroundColor: colors.surfaceRaised,
              color: barColor,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: SmartSpendSpacing.md,
            runSpacing: SmartSpendSpacing.xs,
            children: [
              Text(
                AppLocalizations.of(context)
                    .monSpentP02(moneyText(context, comparison.spent)),
                style: textTheme.bodyMedium?.copyWith(color: colors.foreground),
              ),
              Text(
                isExceeded
                    ? AppLocalizations.of(context).monOverBudgetByP0(
                        moneyText(
                          context,
                          comparison.spent - comparison.allocated,
                        ),
                      )
                    : AppLocalizations.of(context)
                          .monLeftP03(moneyText(context, comparison.remaining)),
                style: textTheme.titleSmall?.copyWith(color: barColor),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Electronic & automated payments breakdown (STA-06, STA-10).
class _ElectronicPaymentsSection extends StatelessWidget {
  const _ElectronicPaymentsSection({required this.stats});

  final MonthStats stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final autoExpense = stats.automatedExpense;
    final manualExpense = math.max(0, stats.expense - autoExpense);

    return GroupedCard(
      title: AppLocalizations.of(context).monRecordedAutomatically,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StatTileRow(
            children: [
              StatTile(
                label: AppLocalizations.of(context).monFromBanksAndWallets,
                amount: autoExpense,
              ),
              StatTile(
                label: AppLocalizations.of(context).monByHandOrCash,
                amount: manualExpense,
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            AppLocalizations.of(context).monTheseCameFromYourBank,
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
        ],
      ),
    );
  }
}

/// Debts and loans overview section (STA-05).
class _DebtsOverviewSection extends ConsumerWidget {
  const _DebtsOverviewSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final debtsAsync = ref.watch(debtsOverviewProvider);
    final debts = debtsAsync.value;
    if (debts == null) return const SizedBox.shrink();

    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    if (debts.isEmpty) {
      return GroupedCard(
        title: AppLocalizations.of(context).monMoneyWithPeople,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              AppLocalizations.of(context).monNoDebtsOrLoansYet,
              style: textTheme.bodyMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          ],
        ),
      );
    }

    return GroupedCard(
      title: AppLocalizations.of(context).monMoneyWithPeopleDebtsAnd,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StatTileRow(
            children: [
              StatTile(
                label: AppLocalizations.of(context).monOwedToYou,
                amount: debts.totalLent,
                kind: AmountKind.income,
              ),
              StatTile(
                label: AppLocalizations.of(context).monYouOwe,
                amount: debts.totalBorrowed,
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          for (final person in debts.balances.take(3))
            Padding(
              padding: const EdgeInsets.symmetric(
                vertical: SmartSpendSpacing.xs,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    person.name,
                    style: textTheme.titleSmall?.copyWith(
                      color: colors.foreground,
                    ),
                  ),
                  Text(
                    person.balance >= 0
                        ? AppLocalizations.of(context)
                              .monOwesYouP0(moneyText(context, person.balance))
                        : AppLocalizations.of(context)
                              .monYouOweP0(moneyText(context, -person.balance)),
                    style: textTheme.titleSmall?.copyWith(
                      color: person.balance >= 0
                          ? colors.accent
                          : colors.danger,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => context.go(ContactsScreen.path),
              child: Text(AppLocalizations.of(context).monSeeAllPeopleAndDebts),
            ),
          ),
        ],
      ),
    );
  }
}

/// Year in review line chart with gaps (STA-09, GAP-18).
class _YearlyReviewSection extends ConsumerWidget {
  const _YearlyReviewSection({required this.year});

  final String year;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final yearlyAsync = ref.watch(yearlyStatsProvider(year));
    final yearly = yearlyAsync.value;
    if (yearly == null || yearly.count == 0) return const SizedBox.shrink();

    final colors = context.smartSpendColors;

    final topMonth = yearly.topMonth;
    final title = topMonth != null
        ? AppLocalizations.of(context).monThisYearYourHighestMonth(
            topMonth.name,
            moneyText(context, topMonth.amount),
          )
        : AppLocalizations.of(context).monYourSpendingInP0(year);

    final points = [
      for (final m in yearly.monthlyData)
        LineDataPoint(
          label: m.month,
          value: m.hasData ? m.amount : null,
          amountFormatted: m.hasData ? moneyText(context, m.amount) : null,
        ),
    ];

    return GroupedCard(
      title: AppLocalizations.of(context).monThisYearP0(year),
      child: SmartSpendLineChart(
        title: title,
        data: points,
        spokenSummary: AppLocalizations.of(context)
            .monChartOfTheYearS(moneyText(context, yearly.totalExpense)),
        accentColor: colors.accent,
      ),
    );
  }
}

/// Smart profile summary and Law 151 compliance note (STA-11).
class _SmartProfileSection extends ConsumerWidget {
  const _SmartProfileSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(smartProfileSummaryProvider);
    final profile = profileAsync.value;

    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return GroupedCard(
      title: AppLocalizations.of(context).monYourSmartProfileAndPrivacy,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.privacy_tip_outlined, size: 20, color: colors.accent),
              const SizedBox(width: SmartSpendSpacing.sm),
              Expanded(
                child: Text(
                  AppLocalizations.of(context).monWhatTheAppLearnedAbout,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
          if (profile != null && profile.salaryDay != null) ...[
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(
              AppLocalizations.of(context)
                  .monYourSavedPaydayDayP0('${profile.salaryDay}'),
              style: textTheme.bodySmall?.copyWith(color: colors.foreground),
            ),
          ],
        ],
      ),
    );
  }
}

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

/// One thing to do about this month, from the person's own numbers: a budget in danger, a first budget on their
/// biggest item, or the assistant's advice on it.
class _NextStepCard extends ConsumerWidget {
  const _NextStepCard({required this.stats});

  final MonthStats stats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budgets = ref.watch(budgetsProvider).value;
    if (budgets == null ||
        ref.watch(statsMonthOffsetProvider) != 0 ||
        stats.expense <= 0 ||
        stats.categories.isEmpty) {
      return const SizedBox.shrink();
    }
    final l10n = AppLocalizations.of(context);
    final top = stats.categories.reduce((a, b) => a.amount >= b.amount ? a : b);
    final inDanger =
        budgets.where((b) => b.isExceeded || b.isNearLimit).toList()
          ..sort((a, b) => b.percentage.compareTo(a.percentage));
    final (sentence, action, IconData icon, path) = inDanger.isNotEmpty
        ? (
            l10n.statsNextBudget(
              inDanger.first.title,
              '${inDanger.first.percentage}',
            ),
            l10n.statsNextBudgetAction,
            Icons.savings_outlined,
            BudgetsScreen.path,
          )
        : budgets.isEmpty
        ? (
            l10n.statsNextFirstBudget(top.name),
            l10n.statsNextFirstBudgetAction,
            Icons.savings_outlined,
            BudgetsScreen.path,
          )
        : (
            l10n.statsNextAsk(top.name),
            l10n.statsNextAskAction,
            Icons.auto_awesome,
            '/ai',
          );
    return GroupedCard(
      title: l10n.statsNextTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(sentence, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: SmartSpendSpacing.md),
          SmartSpendButton(
            label: action,
            icon: icon,
            variant: ButtonVariant.secondary,
            onPressed: () => context.go(path),
          ),
        ],
      ),
    );
  }
}
