import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
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
    final now = DateTime.now();
    final targetDate = DateTime(now.year, now.month - offset, 1);
    final monthKey =
        '${targetDate.year}-${targetDate.month.toString().padLeft(2, '0')}';

    Future<void> refresh() async {
      ref.invalidate(coachOverviewProvider);
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
            tooltip: 'إضافة التزام أو دخل',
            icon: const Icon(Icons.add_rounded),
            onPressed: () => AddCommitmentSheet.show(context),
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
                    error: (_, _) => const _HeroLoadingPlaceholder(),
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
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xl),

                  // Commitments & Expected Income (CAL-03, CAL-04)
                  overviewAsync.when(
                    data: (overview) =>
                        _CommitmentsSection(cashflow: overview.cashflows),
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
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.accent.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: colors.accent),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: Text(
              'الشهر المالي بيبدأ يوم $salaryDay في الشهر وينتهي يوم ${salaryDay - 1}.',
              style: textTheme.bodySmall?.copyWith(
                color: colors.foreground,
                fontWeight: FontWeight.w500,
              ),
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
        ? 'باقي ${pos.days} يوم على يوم القبض (يوم ${salaryDay ?? 1}). بعد الالتزامات المتبقي معاك:'
        : 'باقي ${pos.days} يوم حتى نهاية الشهر المالي. بعد الالتزامات المتبقي معاك:';

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
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
              Text(
                'المتاح حتى يوم القبض',
                style: textTheme.labelLarge?.copyWith(
                  color: colors.mutedForeground,
                  fontWeight: FontWeight.w600,
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
            child: Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  pos.freeBeforeIncome.toStringAsFixed(0),
                  style: textTheme.displaySmall?.copyWith(
                    color: heroColor,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.xs),
                Text(
                  'ج.م',
                  style: textTheme.titleMedium?.copyWith(
                    color: colors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          const Divider(height: 1),
          const SizedBox(height: SmartSpendSpacing.md),

          // Honest status notes from server position (CAL-02)
          for (final note in pos.notes)
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
          if (pos.notes.isNotEmpty)
            const SizedBox(height: SmartSpendSpacing.xs),

          // Financial breakdowns
          Wrap(
            spacing: SmartSpendSpacing.md,
            runSpacing: SmartSpendSpacing.sm,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 130),
                child: _MetricItem(
                  label: 'إجمالي الالتزامات',
                  value: '${pos.duesKnown.toStringAsFixed(0)} ج.م',
                  icon: Icons.assignment_outlined,
                ),
              ),
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 130),
                child: _MetricItem(
                  label: 'رصيد المحافظ',
                  value: pos.walletsCount > 0
                      ? '${pos.walletsTotal.toStringAsFixed(0)} ج.م'
                      : 'غير مسجل',
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
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: colors.mutedForeground),
              const SizedBox(width: 4),
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
          const SizedBox(height: 2),
          Text(
            value,
            style: textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: colors.foreground,
            ),
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
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
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
  });

  final int year;
  final int month;
  final Map<String, num> daySpendMap;
  final int? salaryDay;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.border),
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
              Text(
                'خريطة صرف الشهر',
                style: textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.foreground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'اضغط على أي يوم لمعرفة تفاصيل المصاريف.',
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          CalendarGrid(
            year: year,
            month: month,
            daySpendMap: daySpendMap,
            salaryDay: salaryDay,
          ),
        ],
      ),
    );
  }
}

/// Commitments & Income section (CAL-03, CAL-04).
class _CommitmentsSection extends ConsumerWidget {
  const _CommitmentsSection({required this.cashflow});

  final List<CashflowItem> cashflow;

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
            Text(
              'الالتزامات والدخل المتوقع',
              style: textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: colors.foreground,
              ),
            ),
            TextButton.icon(
              icon: const Icon(Icons.add, size: 18),
              label: const Text('إضافة'),
              onPressed: () => AddCommitmentSheet.show(context),
            ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.xs),
        if (cashflow.isEmpty)
          Container(
            padding: const EdgeInsets.all(SmartSpendSpacing.lg),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.border),
            ),
            child: Center(
              child: Text(
                'مافيش التزامات مسجلة لهذا الشهر.\nضيف فواتيرك وأقساطك لمعرفة المتبقي حتى يوم القبض بدقة.',
                textAlign: TextAlign.center,
                style: textTheme.bodySmall?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ),
          )
        else
          ...cashflow.map((item) => _CommitmentCard(item: item)),
      ],
    );
  }
}

class _CommitmentCard extends ConsumerWidget {
  const _CommitmentCard({required this.item});

  final CashflowItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final isPaid = item.status == 'paid';
    final isPartial = item.status == 'partial';
    final isOverdue = item.status == 'overdue';

    Color statusColor;
    String statusLabel;
    if (isPaid) {
      statusColor = colors.accent;
      statusLabel = 'مسدد';
    } else if (isPartial) {
      statusColor = colors.warning;
      statusLabel = 'مسدد جزئياً';
    } else if (isOverdue) {
      statusColor = colors.danger;
      statusLabel = 'متأخر';
    } else {
      statusColor = colors.mutedForeground;
      statusLabel = 'مستحق';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
      padding: const EdgeInsets.all(SmartSpendSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: colors.background,
            child: Icon(
              item.direction == 'in'
                  ? Icons.arrow_downward_rounded
                  : Icons.arrow_upward_rounded,
              color: item.direction == 'in' ? colors.accent : colors.foreground,
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
                        style: textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    Text(
                      '${item.amount?.toStringAsFixed(0) ?? '—'} ج.م',
                      style: textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: colors.foreground,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: SmartSpendSpacing.sm,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'يوم الاستحقاق: ${item.dueDay ?? '—'}',
                      style: textTheme.labelSmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        statusLabel,
                        style: textTheme.labelSmall?.copyWith(
                          color: statusColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          if (!isPaid)
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(48, 36),
                padding: const EdgeInsets.symmetric(horizontal: 12),
              ),
              onPressed: () => SettleCommitmentSheet.show(context, item: item),
              child: const Text('سداد'),
            )
          else
            IconButton(
              icon: const Icon(Icons.check_circle_rounded),
              color: colors.accent,
              tooltip: 'مسدد (اضغط للإلغاء)',
              onPressed: () async {
                await ref.read(calendarApiProvider).unsettle(item.id);
                ref.invalidate(coachOverviewProvider);
              },
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
        borderRadius: BorderRadius.circular(16),
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
                    'خطة التوفير النشطة',
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
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
                child: const Text('إنهاء الخطة'),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            plan.goal ?? plan.title,
            style: textTheme.bodyMedium?.copyWith(
              color: colors.foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          const Divider(height: 1),
          const SizedBox(height: SmartSpendSpacing.md),
          Text(
            'خطوات الخطة:',
            style: textTheme.labelLarge?.copyWith(
              color: colors.mutedForeground,
              fontWeight: FontWeight.bold,
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
        borderRadius: BorderRadius.circular(10),
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
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          // Cairo reminder button (CAL-05)
          IconButton(
            icon: Icon(
              step.remindAt != null
                  ? Icons.alarm_on_rounded
                  : Icons.alarm_add_rounded,
              size: 20,
              color: step.remindAt != null
                  ? colors.accent
                  : colors.mutedForeground,
            ),
            tooltip: step.remindAt != null ? 'تذكير مفعل' : 'تفعيل تذكير',
            onPressed: () async {
              if (step.remindAt != null) {
                await ref.read(calendarApiProvider).cancelReminder(step.id);
                if (context.mounted) {
                  showSmartSpendNotice(context, 'تم إلغاء التذكير');
                }
              } else {
                // Schedule Cairo reminder at 9:00 AM next day
                final remindDate = DateTime.now().add(const Duration(days: 1));
                final cairoReminder = DateTime(
                  remindDate.year,
                  remindDate.month,
                  remindDate.day,
                  9,
                  0,
                );
                await ref
                    .read(calendarApiProvider)
                    .setReminder(
                      stepId: step.id,
                      scheduledAt: cairoReminder.toIso8601String(),
                    );
                if (context.mounted) {
                  showSmartSpendNotice(
                    context,
                    'تم ضبط التذكير بتوقيت القاهرة',
                  );
                }
              }
              ref.invalidate(coachOverviewProvider);
            },
          ),
          if (!isDone && !isSkipped)
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18),
              tooltip: 'تخطي الخطوة',
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
