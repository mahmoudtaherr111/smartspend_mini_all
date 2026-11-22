import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../commitments/commitment_models.dart';
import '../commitments/commitment_ui.dart';
import '../ledger/ledger_models.dart';
import 'calendar_providers.dart';

class DayTransactionsSheet extends ConsumerStatefulWidget {
  const DayTransactionsSheet({
    super.key,
    required this.dateStr,
    required this.formattedDateAr,
    this.dues = const [],
  });

  final String dateStr;
  final String formattedDateAr;

  /// The commitments due that day: «النهارده عليك تدفع Netflix», with «دفعته».
  final List<DueDate> dues;

  static Future<void> show(
    BuildContext context, {
    required String dateStr,
    required String formattedDateAr,
    List<DueDate> dues = const [],
  }) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => DayTransactionsSheet(
        dateStr: dateStr,
        formattedDateAr: formattedDateAr,
        dues: dues,
      ),
    );
  }

  @override
  ConsumerState<DayTransactionsSheet> createState() =>
      _DayTransactionsSheetState();
}

class _DayTransactionsSheetState extends ConsumerState<DayTransactionsSheet> {
  late Future<List<LedgerEntry>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(calendarApiProvider).getDayTransactions(widget.dateStr);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.75,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(
                Icons.calendar_month_rounded,
                color: colors.accent,
                size: 24,
              ),
              const SizedBox(width: SmartSpendSpacing.sm),
              Expanded(
                child: Text(
                  widget.formattedDateAr,
                  style: textTheme.titleMedium,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
                tooltip: AppLocalizations.of(context).calClose,
              ),
            ],
          ),
          const Divider(height: 1),
          if (widget.dues.isNotEmpty) ...[
            const SizedBox(height: SmartSpendSpacing.md),
            Text(
              widget.dues.any((due) => due.isOpen)
                  ? AppLocalizations.of(context).cmDueThatDay
                  : AppLocalizations.of(context).cmPaidThatDay,
              style: textTheme.titleSmall,
            ),
            for (final due in widget.dues)
              DueRow(key: ValueKey('day-due-${due.cashflowId}'), due: due),
            const Divider(height: 1),
          ],
          const SizedBox(height: SmartSpendSpacing.md),
          Flexible(
            child: FutureBuilder<List<LedgerEntry>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(SmartSpendSpacing.xl),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(SmartSpendSpacing.xl),
                      child: Text(
                        AppLocalizations.of(context).calWeCouldnTLoadThis,
                        style: textTheme.bodyMedium?.copyWith(
                          color: colors.danger,
                        ),
                      ),
                    ),
                  );
                }

                final items = snapshot.data ?? const [];
                if (items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(SmartSpendSpacing.xl),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.sentiment_satisfied_rounded,
                            size: 48,
                            color: colors.mutedForeground,
                          ),
                          const SizedBox(height: SmartSpendSpacing.md),
                          Text(
                            AppLocalizations.of(context)
                                .calNothingRecordedOnThisDay,
                            style: textTheme.bodyMedium?.copyWith(
                              color: colors.mutedForeground,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  itemCount: items.length,
                  separatorBuilder: (context, _) =>
                      const SizedBox(height: SmartSpendSpacing.sm),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final displayType = item.displayType;
                    final isRefund = item.isRefund;
                    final kind = (displayType == 'income' || isRefund)
                        ? AmountKind.income
                        : (displayType == 'transfer' ||
                              displayType == 'investment')
                        ? AmountKind.neutral
                        : AmountKind.expense;
                    final icon = displayType == 'transfer'
                        ? Icons.swap_horiz_rounded
                        : displayType == 'investment'
                        ? Icons.show_chart_rounded
                        : categoryStyleIcon(item.category);
                    return TransactionRow(
                      icon: icon,
                      iconColor: categoryStyleColor(context, item.category),
                      title: item.category,
                      subtitle: item.description ?? item.subCategory ?? '',
                      amount: item.displayAmount,
                      kind: kind,
                      onTap: () {
                        Navigator.of(context).pop();
                        context.push('/transaction/${item.id}');
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
