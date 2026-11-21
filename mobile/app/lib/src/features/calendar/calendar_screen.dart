import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../commitments/add_commitment_screen.dart';
import '../commitments/commitment_api.dart';
import '../commitments/commitment_models.dart';
import '../commitments/commitments_screen.dart';
import '../infrastructure/remote_config.dart';
import '../ledger/ledger_providers.dart';
import '../wallets/wallet_providers.dart';
import '../wallets/wallets_screen.dart';
import 'calendar_grid.dart';
import 'calendar_models.dart';
import 'calendar_providers.dart';
import 'commitment_sheets.dart';

/// The Calendar & Payday Planning screen (CAL-01..CAL-06, STA-12).
/// Answers "Am I going to be OK until payday?" in one second with a number and a sentence,
/// provides a Cairo-week spending heatmap grid, commitments tracker with settling,
/// and active plan steps with Cairo reminders.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  static const path = '/calendar';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    final offset = ref.watch(calendarMonthOffsetProvider);
    final salaryDay = ref.watch(salaryDayProvider).value;
    final overviewAsync = ref.watch(coachOverviewProvider);
    final statsAsync = ref.watch(calendarMonthStatsProvider);
    final words = DateWords.of(context);

    // Compute month key and current target date
    final monthKey = calendarMonthKey(
      ref.watch(serverMonthProvider).value,
      offset,
    );
    // Each day's commitment dates, for the logos on the grid and the day's sheet.
    final dues = <String, List<DueDate>>{};
    for (final due
        in ref.watch(commitmentsMonthProvider(monthKey)).value ??
            const <DueDate>[]) {
      dues.putIfAbsent(due.day, () => []).add(due);
    }
    final monthParts = monthKey.split('-');
    final targetDate = DateTime(
      int.parse(monthParts[0]),
      int.parse(monthParts[1]),
    );

    Future<void> refresh() async {
      ref.invalidate(coachOverviewProvider);
      ref.invalidate(commitmentsMonthProvider);
      ref.invalidate(calendarMonthStatsProvider);
      ref.invalidate(salaryDayProvider);
      await Future.wait([
        ref.read(coachOverviewProvider.future),
        ref.read(calendarMonthStatsProvider.future),
      ]);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navCalendar),
        actions: [
          IconButton(
            tooltip: AppLocalizations.of(context).calAddACommitmentOrIncome,
            icon: const Icon(Icons.add_rounded),
            onPressed: () => context.push(AddCommitmentScreen.path),
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
              label: words.month(monthKey),
              previousTooltip: l10n.statsPreviousMonth,
              nextTooltip: l10n.statsNextMonth,
              onPrevious: () =>
                  ref.read(calendarMonthOffsetProvider.notifier).previous(),
              onNext: offset == 0
                  ? null
                  : () => ref.read(calendarMonthOffsetProvider.notifier).next(),
            ),
          ),

          // Payday month helper banner (STA-12)
          if (salaryDay != null && salaryDay > 1)
            _PaydayMonthBanner(salaryDay: salaryDay, targetDate: targetDate),

          Expanded(
            child: RefreshIndicator(
              onRefresh: refresh,
              child: ListView(
                padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                children: [
                  // Hero Section: Cash position until payday (CAL-02)
                  overviewAsync.when(
                    data: (overview) => _HeroPaydayPlan(
                      overview: overview,
                      salaryDay: salaryDay,
                    ),
                    loading: () => const _HeroLoadingPlaceholder(),
                    // A failed load must end in a way forward, never in a spinner that never stops.
                    error: (_, _) => ErrorState(
                      message: AppLocalizations.of(context).calendarLoadFailed,
                      retryLabel: AppLocalizations.of(context).retry,
                      onRetry: () => ref.invalidate(coachOverviewProvider),
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.lg),

                  // Calendar Grid Section (CAL-01)
                  statsAsync.when(
                    data: (stats) {
                      final daySpendMap = {
                        for (final p in stats.dayTrend) p.date: p.amount,
                      };
                      return _CalendarSection(
                        year: targetDate.year,
                        month: targetDate.month,
                        daySpendMap: daySpendMap,
                        salaryDay: salaryDay,
                        dues: dues,
                      );
                    },
                    loading: () => const Center(
                      child: Padding(
                        padding: EdgeInsets.all(SmartSpendSpacing.lg),
                        child: CircularProgressIndicator.adaptive(),
                      ),
                    ),
                    error: (_, _) => _CalendarSection(
                      year: targetDate.year,
                      month: targetDate.month,
                      daySpendMap: const {},
                      salaryDay: salaryDay,
                      dues: dues,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xl),

                  // Commitments & Expected Income (CAL-03, CAL-04)
                  overviewAsync.when(
                    data: (overview) => _CommitmentsSection(due: overview.due),
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xl),

                  // Active Plan Steps & Reminders (CAL-05, CAL-06)
                  overviewAsync.when(
                    data: (overview) {
                      final plan = overview.plan;
                      if (plan == null) {
                        return const SizedBox.shrink();
                      }
                      return _ActivePlanSection(plan: plan, steps: plan.steps);
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xxl),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Banner explaining the payday financial month shift (STA-12).
class _PaydayMonthBanner extends StatelessWidget {
  const _PaydayMonthBanner({required this.salaryDay, required this.targetDate});

  final int salaryDay;
  final DateTime targetDate;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      margin: const EdgeInsets.symmetric(
        horizontal: SmartSpendSpacing.screen,
        vertical: SmartSpendSpacing.xs,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: SmartSpendSpacing.md,
        vertical: SmartSpendSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: colors.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
        border: Border.all(color: colors.accent.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: colors.accent),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: Text(
              AppLocalizations.of(
                context,
              ).calYourFinancialMonthStartsOn('$salaryDay', '${salaryDay - 1}'),
              style: textTheme.bodySmall?.copyWith(color: colors.foreground),
            ),
          ),
        ],
      ),
    );
  }
}

/// Hero section answering "Am I going to be OK until payday?" (CAL-02).
class _HeroPaydayPlan extends StatelessWidget {
  const _HeroPaydayPlan({required this.overview, this.salaryDay});

  final CoachOverviewData overview;
  final int? salaryDay;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final pos = overview.position;

    final isPositive = pos.freeBeforeIncome >= 0;
    final heroColor = isPositive ? colors.accent : colors.danger;

    final explanationSentence = pos.untilIsPayday
        ? AppLocalizations.of(context)
              .calP0DaysToPaydayDay('${pos.days}', '${salaryDay ?? 1}')
        : AppLocalizations.of(context).calP0DaysToTheEnd('${pos.days}');

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.account_balance_wallet_outlined,
                size: 20,
                color: colors.mutedForeground,
              ),
              const SizedBox(width: SmartSpendSpacing.xs),
              Expanded(
                child: Text(
                  AppLocalizations.of(context).calLeftUntilPayday,
                  style: textTheme.labelLarge?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            explanationSentence,
            style: textTheme.bodyMedium?.copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              moneyText(context, pos.freeBeforeIncome),
              style: textTheme.displaySmall?.copyWith(color: heroColor),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          const Divider(height: 1),
          const SizedBox(height: SmartSpendSpacing.md),

          // Honest status notes from server position (CAL-02)
          for (final note in [
            if (pos.walletsCount == 0)
              AppLocalizations.of(context).calNoWalletsYetSoThe,
            if (pos.unknownBalanceAge)
              AppLocalizations.of(context).calOneBalanceHasNoKnown,
            if (pos.unknownAmounts.isNotEmpty)
              AppLocalizations.of(context)
                  .calCommitmentsWithNoKnownAmount(pos.unknownAmounts),
            if (pos.undatedItems.isNotEmpty)
              AppLocalizations.of(context)
                  .calCommitmentsWithNoDateSo(pos.undatedItems),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: SmartSpendSpacing.xs),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline_rounded,
                    size: 15,
                    color: colors.mutedForeground,
                  ),
                  const SizedBox(width: SmartSpendSpacing.xs),
                  Expanded(
                    child: Text(
                      note,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (pos.walletsCount == 0 ||
              pos.unknownBalanceAge ||
              pos.unknownAmounts.isNotEmpty ||
              pos.undatedItems.isNotEmpty)
            const SizedBox(height: SmartSpendSpacing.xs),

          // A plan on an old balance says so and offers the fix.
          Consumer(
            builder: (context, ref, _) {
              final wallets = ref.watch(walletsProvider).value ?? const [];
              if (staleWallets(wallets, clock.now()).isEmpty) {
                return const SizedBox.shrink();
              }
              return Padding(
                padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
                child: InlineMessage(
                  AppLocalizations.of(context).calOldBalances,
                  tone: MessageTone.warning,
                  action: TextButton(
                    onPressed: () => context.go(WalletsScreen.path),
                    child: Text(AppLocalizations.of(context).calUpdateBalances),
                  ),
                ),
              );
            },
          ),

          // Financial breakdowns
          Wrap(
            spacing: SmartSpendSpacing.md,
            runSpacing: SmartSpendSpacing.sm,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 130),
                child: _MetricItem(
                  label: AppLocalizations.of(context).calTotalCommitments,
                  value: moneyText(context, pos.duesKnown),
                  icon: Icons.assignment_outlined,
                ),
              ),
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 130),
                child: _MetricItem(
                  label: AppLocalizations.of(context).calWalletBalances,
                  value: pos.walletsCount > 0
                      ? moneyText(context, pos.walletsTotal)
                      : AppLocalizations.of(context).calNotRecorded,
                  icon: Icons.payments_outlined,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricItem extends StatelessWidget {
  const _MetricItem({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.sm),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: colors.mutedForeground),
              const SizedBox(width: SmartSpendSpacing.xs),
              Expanded(
                child: Text(
                  label,
                  style: textTheme.labelSmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.xs / 2),
          Text(
            value,
            style: textTheme.titleSmall?.copyWith(color: colors.foreground),
          ),
        ],
      ),
    );
  }
}

class _HeroLoadingPlaceholder extends StatelessWidget {
  const _HeroLoadingPlaceholder();

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      ),
      child: const Center(child: CircularProgressIndicator.adaptive()),
    );
  }
}

/// Calendar grid section card (CAL-01).
class _CalendarSection extends StatelessWidget {
  const _CalendarSection({
    required this.year,
    required this.month,
    required this.daySpendMap,
    this.salaryDay,
    this.dues = const {},
  });

  final int year;
  final int month;
  final Map<String, num> daySpendMap;
  final int? salaryDay;
  final Map<String, List<DueDate>> dues;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.calendar_today_rounded,
                size: 20,
                color: colors.foreground,
              ),
              const SizedBox(width: SmartSpendSpacing.xs),
              Expanded(
                child: Text(
                  AppLocalizations.of(context).calThisMonthSSpending,
                  style: textTheme.titleMedium?.copyWith(
                    color: colors.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            AppLocalizations.of(context).calTapADayToSee,
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          CalendarGrid(
            year: year,
            month: month,
            daySpendMap: daySpendMap,
            salaryDay: salaryDay,
            dues: dues,
          ),
        ],
      ),
    );
  }
}

/// Commitments & Income section (CAL-03, CAL-04): the due dates `coach.overview` lists, 45 days either side of
/// today, each with the status the server gave it.
class _CommitmentsSection extends ConsumerWidget {
  const _CommitmentsSection({required this.due});

  final List<CashflowItem> due;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                AppLocalizations.of(context).calCommitmentsAndExpectedIncome,
                style: textTheme.titleMedium?.copyWith(
                  color: colors.foreground,
                ),
              ),
            ),
            TextButton(
              onPressed: () => context.push(CommitmentsScreen.path),
              child: Text(AppLocalizations.of(context).cmSeeAll),
            ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.xs),
        if (due.isEmpty)
          Container(
            padding: const EdgeInsets.all(SmartSpendSpacing.lg),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(SmartSpendRadii.md),
            ),
            child: Center(
              child: Text(
                AppLocalizations.of(context).calNoCommitmentsThisMonthAdd,
                textAlign: TextAlign.center,
                style: textTheme.bodySmall?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ),
          )
        else
          ...due.map(
            (item) => _CommitmentCard(
              key: ValueKey('due-${item.cashflowId}-${item.dueDay}'),
              item: item,
            ),
          ),
      ],
    );
  }
}

/// «16 أكتوبر» for a Cairo day key; the key itself when it is not one.
String _dueDayLabel(BuildContext context, String dayKey) {
  final match = RegExp(r'^\d{4}-(\d{2})-(\d{2})$').firstMatch(dayKey);
  if (match == null) return dayKey;
  final month = int.parse(match.group(1)!);
  final day = int.parse(match.group(2)!);
  if (month < 1 || month > 12) return dayKey;
  return '$day ${DateWords.of(context).months[month - 1]}';
}

class _CommitmentCard extends ConsumerWidget {
  const _CommitmentCard({super.key, required this.item});

  final CashflowItem item;

  /// Unlinks every payment of this due date; the recorded payments themselves stay as they are.
  Future<void> _undoPaid(BuildContext context, WidgetRef ref) async {
    final failed = AppLocalizations.of(context).calWeCouldnTUndoIt;
    try {
      final api = ref.read(calendarApiProvider);
      for (final settlement in item.settlements) {
        await api.unsettle(settlement.id);
      }
    } on Object {
      if (context.mounted) showSmartSpendNotice(context, failed);
    }
    ref.invalidate(coachOverviewProvider);
  }

  /// Ends the whole commitment after the user confirms: it stops showing and stops counting; what was paid stays.
  Future<void> _stop(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.calStopThisCommitment),
        content: Text(l10n.calStopCommitmentP0Explained(item.title)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.appCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(dialogContext).colorScheme.error,
            ),
            child: Text(l10n.calStop),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref
          .read(calendarApiProvider)
          .updateCashflow(id: item.cashflowId, status: 'ended');
    } on Object {
      if (context.mounted) {
        showSmartSpendNotice(context, l10n.calWeCouldnTStopIt);
      }
    }
    ref.invalidate(coachOverviewProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context);

    Color statusColor;
    String statusLabel;
    if (item.isPaid) {
      statusColor = colors.accent;
      statusLabel = l10n.calPaid;
    } else if (item.isPartial) {
      statusColor = colors.warning;
      statusLabel = l10n.calPartlyPaid;
    } else if (item.isOverdue) {
      statusColor = colors.danger;
      statusLabel = l10n.calOverdue;
    } else if (item.isUnconfirmed) {
      statusColor = colors.mutedForeground;
      statusLabel = l10n.calPaidOrNot;
    } else {
      statusColor = colors.mutedForeground;
      statusLabel = l10n.calDue;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
      padding: const EdgeInsets.all(SmartSpendSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: colors.background,
            child: Icon(
              item.isIncome
                  ? Icons.arrow_downward_rounded
                  : Icons.arrow_upward_rounded,
              color: item.isIncome ? colors.accent : colors.foreground,
              size: 20,
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: textTheme.titleSmall?.copyWith(
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    Text(
                      item.amount == null
                          ? '—'
                          : moneyText(context, item.amount!),
                      style: textTheme.titleSmall?.copyWith(
                        color: colors.foreground,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Wrap(
                  spacing: SmartSpendSpacing.sm,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      l10n.calDueOnDayP0(_dueDayLabel(context, item.dueDay)),
                      style: textTheme.labelSmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: SmartSpendSpacing.sm,
                        vertical: SmartSpendSpacing.xs / 2,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                      ),
                      child: Text(
                        statusLabel,
                        style: textTheme.labelSmall?.copyWith(
                          color: statusColor,
                        ),
                      ),
                    ),
                    if (item.isPartial && item.remaining != null)
                      Text(
                        l10n.appP0Left(moneyText(context, item.remaining!)),
                        style: textTheme.labelSmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          if (!item.isPaid)
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(48, 36),
                padding: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.md,
                ),
              ),
              onPressed: () => SettleCommitmentSheet.show(context, item: item),
              child: Text(l10n.calSettle),
            )
          else
            IconButton(
              icon: const Icon(Icons.check_circle_rounded),
              color: colors.accent,
              tooltip: l10n.calPaidTapToUndo,
              onPressed: item.settlements.isEmpty
                  ? null
                  : () => _undoPaid(context, ref),
            ),
          PopupMenuButton<String>(
            tooltip: l10n.calMoreOptions,
            icon: Icon(Icons.more_vert_rounded, color: colors.mutedForeground),
            onSelected: (value) {
              if (value == 'stop') _stop(context, ref);
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'stop',
                child: Text(l10n.calStopThisCommitment),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Active plan section and steps (CAL-05, CAL-06).
class _ActivePlanSection extends ConsumerWidget {
  const _ActivePlanSection({required this.plan, required this.steps});

  final ActivePlan plan;
  final List<PlanStep> steps;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        border: Border.all(color: colors.accent.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(Icons.flag_rounded, color: colors.accent, size: 22),
                  const SizedBox(width: SmartSpendSpacing.xs),
                  Text(
                    AppLocalizations.of(context).calActiveSavingPlan,
                    style: textTheme.titleMedium?.copyWith(
                      color: colors.foreground,
                    ),
                  ),
                ],
              ),
              TextButton(
                onPressed: () async {
                  await ref.read(calendarApiProvider).endPlan(plan.id);
                  ref.invalidate(coachOverviewProvider);
                },
                child: Text(AppLocalizations.of(context).calEndThePlan),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            plan.goal ?? plan.title,
            style: textTheme.titleSmall?.copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          const Divider(height: 1),
          const SizedBox(height: SmartSpendSpacing.md),
          Text(
            AppLocalizations.of(context).calPlanSteps,
            style: textTheme.labelLarge?.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          ...steps.map((step) => _StepTile(step: step)),
        ],
      ),
    );
  }
}

class _StepTile extends ConsumerWidget {
  const _StepTile({required this.step});

  final PlanStep step;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final isDone = step.status == 'done';
    final isSkipped = step.status == 'skipped';

    return Container(
      margin: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
      padding: const EdgeInsets.all(SmartSpendSpacing.sm),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
      ),
      child: Row(
        children: [
          Checkbox(
            value: isDone,
            activeColor: colors.accent,
            onChanged: (val) async {
              final newStatus = (val == true) ? 'done' : 'pending';
              await ref
                  .read(calendarApiProvider)
                  .setStepStatus(stepId: step.id, status: newStatus);
              ref.invalidate(coachOverviewProvider);
            },
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.title,
                  style: textTheme.bodyMedium?.copyWith(
                    decoration: isDone ? TextDecoration.lineThrough : null,
                    color: isDone ? colors.mutedForeground : colors.foreground,
                  ),
                ),
              ],
            ),
          ),
          // Cairo reminder button (CAL-05)
          IconButton(
            icon: Icon(
              step.hasReminder
                  ? Icons.alarm_on_rounded
                  : Icons.alarm_add_rounded,
              size: 20,
              color: step.hasReminder ? colors.accent : colors.mutedForeground,
            ),
            tooltip: step.hasReminder
                ? AppLocalizations.of(context).calReminderOn
                : AppLocalizations.of(context).calTurnOnAReminder,
            onPressed: () async {
              if (step.hasReminder) {
                await ref.read(calendarApiProvider).cancelReminder(step.id);
                if (context.mounted) {
                  showSmartSpendNotice(
                    context,
                    AppLocalizations.of(context).calReminderCancelled,
                  );
                }
              } else {
                // 9:00 tomorrow on Cairo's clock: the day comes from the server (mobile rule 8), the phone's
                // clock only until the server has answered.
                final today =
                    ref.read(coachOverviewProvider).value?.today ??
                    dayKeyOf(DateTime.now());
                final tomorrow = addDaysToDayKey(today, 1);
                if (tomorrow == null) return;
                await ref
                    .read(calendarApiProvider)
                    .setReminder(stepId: step.id, at: '${tomorrow}T09:00');
                if (context.mounted) {
                  showSmartSpendNotice(
                    context,
                    AppLocalizations.of(context).calReminderSetCairoTime,
                  );
                }
              }
              ref.invalidate(coachOverviewProvider);
            },
          ),
          if (!isDone && !isSkipped)
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18),
              tooltip: AppLocalizations.of(context).calSkipThisStep,
              onPressed: () async {
                await ref
                    .read(calendarApiProvider)
                    .setStepStatus(stepId: step.id, status: 'skipped');
                ref.invalidate(coachOverviewProvider);
              },
            ),
        ],
      ),
    );
  }
}
