import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'category_style.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';

/// The month at a glance: what was spent, what came in, and how many transactions, from
/// `expense.getMonthSummary`.
class MonthSummaryCard extends ConsumerWidget {
  const MonthSummaryCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final month = ref.watch(currentMonthProvider).value;
    final summary = ref.watch(monthSummaryProvider);
    final monthName = month == null
        ? ''
        : DateWords.of(context).monthName(month);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: switch (summary) {
          AsyncData(:final value) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.summarySpentIn(monthName),
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              AmountText(value.expense, style: textTheme.displaySmall),
              const SizedBox(height: SmartSpendSpacing.md),
              // Wraps onto two lines on a narrow phone or with large text instead of overflowing.
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: SmartSpendSpacing.md,
                runSpacing: SmartSpendSpacing.xs,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${l10n.summaryIncome} ',
                        style: textTheme.bodyMedium?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      AmountText(
                        value.income,
                        kind: AmountKind.income,
                        style: textTheme.bodyLarge,
                      ),
                    ],
                  ),
                  Text(
                    l10n.summaryCount(value.count),
                    style: textTheme.bodyMedium?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                ],
              ),
            ],
          ),
          AsyncError() => Row(
            children: [
              Expanded(child: Text(l10n.summaryLoadFailed)),
              SmartSpendButton(
                label: l10n.retry,
                variant: ButtonVariant.quiet,
                expand: false,
                onPressed: () => ref.invalidate(monthSummaryProvider),
              ),
            ],
          ),
          _ => const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Skeleton(width: 110),
              SizedBox(height: SmartSpendSpacing.sm),
              Skeleton(width: 180, height: 36),
              SizedBox(height: SmartSpendSpacing.md),
              Skeleton(width: 220),
            ],
          ),
        },
      ),
    );
  }
}

/// Transactions under a heading for each day: «النهارده», «امبارح», «الخميس 15 أكتوبر». With [onDelete], a row can
/// be swiped toward the start of the line (to the right in Arabic, the mirror of a list's left swipe on iOS), or
/// deleted through the screen reader's actions menu (rule 12.2: every gesture has another way).
class LedgerDayList extends StatelessWidget {
  const LedgerDayList({super.key, required this.entries, this.onDelete});

  final List<LedgerEntry> entries;
  final void Function(LedgerEntry entry)? onDelete;

  @override
  Widget build(BuildContext context) {
    final words = DateWords.of(context);
    final now = clock.now();
    final children = <Widget>[];
    String? currentDay;
    for (final entry in entries) {
      final day = words.day(entry.date, now: now);
      if (day != currentDay) {
        currentDay = day;
        children.add(SectionHeader(day));
      }
      children.add(_EntryRow(entry: entry, onDelete: onDelete));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.entry, this.onDelete});

  final LedgerEntry entry;
  final void Function(LedgerEntry entry)? onDelete;

  @override
  Widget build(BuildContext context) {
    final words = DateWords.of(context);
    final colors = context.smartSpendColors;
    final row = TransactionRow(
      icon: categoryIcon(entry.category),
      iconColor: categoryColor(context, entry.category),
      title: entry.title,
      subtitle: '${entry.category} · ${inlineName(words.clock(entry.date))}',
      amount: entry.amount.abs(),
      kind: entryKind(entry),
    );
    final delete = onDelete;
    if (delete == null) return row;

    final label = AppLocalizations.of(context).deleteAction;
    return Semantics(
      customSemanticsActions: {
        CustomSemanticsAction(label: label): () => delete(entry),
      },
      child: Dismissible(
        key: ValueKey(entry.id),
        direction: DismissDirection.endToStart,
        onDismissed: (_) => delete(entry),
        background: Container(
          alignment: AlignmentDirectional.centerEnd,
          padding: const EdgeInsetsDirectional.only(end: SmartSpendSpacing.xl),
          decoration: BoxDecoration(
            color: colors.danger.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(SmartSpendRadii.md),
          ),
          child: Icon(Icons.delete_outline, color: colors.danger),
        ),
        child: row,
      ),
    );
  }
}

/// Placeholder rows in the shape of transactions, while the list loads.
class LedgerSkeleton extends StatelessWidget {
  const LedgerSkeleton({super.key, this.rows = 4});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < rows; i++)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
            child: Row(
              children: [
                Skeleton(width: 44, height: 44),
                SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Skeleton(width: 140),
                      SizedBox(height: SmartSpendSpacing.xs),
                      Skeleton(width: 90, height: 12),
                    ],
                  ),
                ),
                Skeleton(width: 64, height: 18),
              ],
            ),
          ),
      ],
    );
  }
}
