import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../commitments/commitment_models.dart';
import '../commitments/commitment_ui.dart';

import 'calendar_models.dart';
import 'day_transactions_sheet.dart';

class CalendarGrid extends StatelessWidget {
  const CalendarGrid({
    super.key,
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

  /// The commitment dates of each day ("2026-11-05"): a known service's logo shows on its day.
  final Map<String, List<DueDate>> dues;

  /// `DateWords.weekdays` starts on Monday; the grid starts on Saturday.
  static const _saturdayFirst = [5, 6, 0, 1, 2, 3, 4];

  /// English names are cut to three letters so a column stays readable; Arabic ones fit whole.
  static String _shortDay(BuildContext context, int index) {
    final name = DateWords.of(context).weekdays[index];
    return Localizations.localeOf(context).languageCode == 'en'
        ? name.substring(0, 3)
        : name;
  }

  @override
  Widget build(BuildContext context) {
    final textScaler = MediaQuery.textScalerOf(context);
    // At text scale >= 2.0, switch to a vertical day list (CAL-01)
    if (textScaler.scale(1) >= 2.0) {
      return _CalendarDayList(
        year: year,
        month: month,
        daySpendMap: daySpendMap,
        salaryDay: salaryDay,
        dues: dues,
      );
    }

    return _CalendarMonthGrid(
      year: year,
      month: month,
      daySpendMap: daySpendMap,
      salaryDay: salaryDay,
      dues: dues,
    );
  }
}

class _CalendarMonthGrid extends StatelessWidget {
  const _CalendarMonthGrid({
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

    final now = DateTime.now();
    final isCurrentMonth = now.year == year && now.month == month;
    final todayDay = isCurrentMonth ? now.day : null;

    final firstDayOfMonth = DateTime(year, month, 1);
    final daysInMonth = DateTime(year, month + 1, 0).day;

    // In Egypt, the week starts on Saturday.
    // DateTime.weekday: Monday=1 ... Saturday=6, Sunday=7.
    // Offset relative to Saturday (Saturday = 0, Sunday = 1, ... Friday = 6):
    final leadingEmpty = (firstDayOfMonth.weekday % 7 + 1) % 7;

    num maxSpend = 1;
    for (final spend in daySpendMap.values) {
      if (spend > maxSpend) maxSpend = spend;
    }

    final cells = <CalendarDayCell>[];
    for (int i = 0; i < leadingEmpty; i++) {
      cells.add(const CalendarDayCell.empty());
    }

    for (int day = 1; day <= daysInMonth; day++) {
      final dateStr =
          '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final shortKey =
          '${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final amount = daySpendMap[dateStr] ?? daySpendMap[shortKey] ?? 0;
      final intensity = maxSpend > 0
          ? (amount / maxSpend).clamp(0.0, 1.0)
          : 0.0;
      final isToday = day == todayDay;
      final isPayday = salaryDay != null && day == salaryDay;

      cells.add(
        CalendarDayCell(
          dateStr: dateStr,
          dayNumber: day,
          amount: amount,
          income: 0,
          isToday: isToday,
          isPayday: isPayday,
          intensity: intensity,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Weekday headers starting on Saturday in Arabic
        Row(
          children: [
            for (final index in CalendarGrid._saturdayFirst)
              Expanded(
                child: Text(
                  CalendarGrid._shortDay(context, index),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: textTheme.labelSmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.xs),

        // Grid of days
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
            childAspectRatio: 0.88,
          ),
          itemCount: cells.length,
          itemBuilder: (context, index) {
            final cell = cells[index];
            if (cell.isEmpty) return const SizedBox.shrink();

            return _DayCellWidget(
              cell: cell,
              colors: colors,
              dues: dues[cell.dateStr] ?? const [],
            );
          },
        ),
      ],
    );
  }
}

class _DayCellWidget extends StatelessWidget {
  const _DayCellWidget({
    required this.cell,
    required this.colors,
    this.dues = const [],
  });

  final CalendarDayCell cell;
  final SmartSpendColors colors;
  final List<DueDate> dues;

  @override
  Widget build(BuildContext context) {
    // Intensity color from spending
    final bgAlpha = (cell.intensity * 0.7).clamp(0.06, 0.75);
    final bgColor = cell.amount > 0
        ? colors.danger.withValues(alpha: bgAlpha)
        : colors.surfaceRaised;

    // Distinct shape for Today: distinct border ring
    final border = cell.isToday
        ? Border.all(color: colors.accent, width: 2)
        : Border.all(color: colors.border.withValues(alpha: 0.3), width: 1);

    return InkWell(
      onTap: () {
        DayTransactionsSheet.show(
          context,
          dateStr: cell.dateStr,
          formattedDateAr: AppLocalizations.of(context)
              .calTransactionsOfDayP0('${cell.dayNumber}'),
          dues: dues,
        );
      },
      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
      child: Container(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
          border: border,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: SmartSpendSpacing.xs / 2,
          vertical: SmartSpendSpacing.xs,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${cell.dayNumber}',
                  style: Theme.of(context).textTheme.labelSmall!.copyWith(
                    color: cell.isToday ? colors.accent : colors.foreground,
                  ),
                ),
                // A commitment's mark on its day (a known service's logo), else payday's star, else today's dot.
                if (dues.isNotEmpty)
                  DueMarks(dues: dues, size: 14, compact: true)
                else if (cell.isPayday)
                  Icon(Icons.stars_rounded, size: 11, color: colors.warning)
                else if (cell.isToday)
                  Container(
                    width: 4,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colors.accent,
                      shape: BoxShape.circle,
                    ),
                  )
                else
                  const SizedBox(width: SmartSpendSpacing.xs),
              ],
            ),
            if (cell.amount > 0)
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  MoneyPrivacy.hiddenOf(context)
                      ? hiddenDigits
                      : cell.amount >= 1000
                      ? '${(cell.amount / 1000).toStringAsFixed(1)}k'
                      : '${cell.amount.round()}',
                  style: Theme.of(context).textTheme.labelSmall!
                      .copyWith(color: colors.foreground),
                ),
              )
            else
              const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }
}

/// Fallback list view when textScaler >= 2.0 (CAL-01).
class _CalendarDayList extends StatelessWidget {
  const _CalendarDayList({
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

    final daysInMonth = DateTime(year, month + 1, 0).day;
    final now = DateTime.now();
    final isCurrentMonth = now.year == year && now.month == month;

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: daysInMonth,
      separatorBuilder: (context, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final day = index + 1;
        final date = DateTime(year, month, day);
        final dateStr =
            '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
        final shortKey =
            '${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
        final amount = daySpendMap[dateStr] ?? daySpendMap[shortKey] ?? 0;
        final isToday = isCurrentMonth && day == now.day;
        final isPayday = salaryDay != null && day == salaryDay;

        return Material(
          color: Colors.transparent,
          child: ListTile(
            onTap: () {
              DayTransactionsSheet.show(
                context,
                dateStr: dateStr,
                formattedDateAr: AppLocalizations.of(context)
                    .calTransactionsOfDayP02('$day'),
                dues: dues[dateStr] ?? const [],
              );
            },
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isToday ? colors.accent : colors.surfaceRaised,
                border: Border.all(
                  color: isToday ? colors.accent : colors.border,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                '$day',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: isToday ? colors.onAccent : colors.foreground,
                ),
              ),
            ),
            title: Wrap(
              spacing: SmartSpendSpacing.xs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  DateWords.of(context).weekdays[date.weekday - 1],
                  style: textTheme.titleSmall,
                ),
                if (isPayday)
                  Text(
                    AppLocalizations.of(context).calPayday,
                    style: textTheme.labelMedium?.copyWith(
                      color: colors.warning,
                    ),
                  ),
                if (dues[dateStr] case final List<DueDate> today
                    when today.isNotEmpty)
                  DueMarks(dues: today, size: 20),
              ],
            ),
            trailing: amount > 0
                ? AmountText(
                    amount,
                    kind: AmountKind.expense,
                    style: textTheme.titleMedium,
                  )
                : Text(
                    AppLocalizations.of(context).calNoSpending,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
          ),
        );
      },
    );
  }
}

/// The commitments due on one day, as small marks: a known service's logo (Netflix's on its day), else its kind's
/// icon, and «+2» when there are more. A screen reader hears their names.
class DueMarks extends StatelessWidget {
  const DueMarks({
    super.key,
    required this.dues,
    this.size = 16,
    this.compact = false,
  });

  final List<DueDate> dues;
  final double size;

  /// In a grid cell: the count sits on the mark instead of beside it.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final first = dues.first;
    final more = dues.length - 1;
    final mark = CommitmentAvatar(
      kind: first.kind,
      title: first.title,
      slug: first.catalogSlug,
      brandColor: first.brandColor,
      logoUrl: first.logoUrl,
      size: size,
    );
    if (compact) {
      return Semantics(
        label: dues.map((due) => due.title).join('، '),
        excludeSemantics: true,
        child: Badge(
          isLabelVisible: more > 0,
          smallSize: 6,
          backgroundColor: colors.accent,
          child: mark,
        ),
      );
    }
    return Semantics(
      label: dues.map((due) => due.title).join('، '),
      excludeSemantics: true,
      // A Wrap, so the count moves under the mark when large text leaves no room beside it.
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          mark,
          if (more > 0)
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: SmartSpendSpacing.xs / 2,
              ),
              child: Text(
                '+$more',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: first.isPaid
                      ? colors.mutedForeground
                      : colors.foreground,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
