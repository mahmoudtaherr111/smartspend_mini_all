import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'calendar_models.dart';
import 'day_transactions_sheet.dart';

class CalendarGrid extends StatelessWidget {
  const CalendarGrid({
    super.key,
    required this.year,
    required this.month,
    required this.daySpendMap,
    this.salaryDay,
  });

  final int year;
  final int month;
  final Map<String, num> daySpendMap;
  final int? salaryDay;

  /// `DateWords.weekdays` starts on Monday; the grid starts on Saturday.
  static const _saturdayFirst = [5, 6, 0, 1, 2, 3, 4];

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
      );
    }

    return _CalendarMonthGrid(
      year: year,
      month: month,
      daySpendMap: daySpendMap,
      salaryDay: salaryDay,
    );
  }
}

class _CalendarMonthGrid extends StatelessWidget {
  const _CalendarMonthGrid({
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
                  DateWords.of(context).weekdays[index],
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: textTheme.labelSmall?.copyWith(
                    color: colors.mutedForeground,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
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

            return _DayCellWidget(cell: cell, colors: colors);
          },
        ),
      ],
    );
  }
}

class _DayCellWidget extends StatelessWidget {
  const _DayCellWidget({required this.cell, required this.colors});

  final CalendarDayCell cell;
  final SmartSpendColors colors;

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
        );
      },
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(8),
          border: border,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${cell.dayNumber}',
                  style:
                      SmartSpendTypography.style(
                        11,
                        cell.isToday ? FontWeight.w800 : FontWeight.w600,
                      ).copyWith(
                        color: cell.isToday ? colors.accent : colors.foreground,
                      ),
                ),
                // Payday shape marker: small star icon
                if (cell.isPayday)
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
                  const SizedBox(width: 4),
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
                  style: SmartSpendTypography.style(
                    10,
                    FontWeight.bold,
                  ).copyWith(color: colors.foreground),
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
  });

  final int year;
  final int month;
  final Map<String, num> daySpendMap;
  final int? salaryDay;

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
                style: TextStyle(
                  color: isToday ? colors.onAccent : colors.foreground,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            title: Wrap(
              spacing: SmartSpendSpacing.xs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  DateWords.of(context).weekdays[date.weekday - 1],
                  style: textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (isPayday)
                  Text(
                    AppLocalizations.of(context).calPayday,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.warning,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
              ],
            ),
            trailing: amount > 0
                ? AmountText(
                    amount,
                    kind: AmountKind.expense,
                    style: textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
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
