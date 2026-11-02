import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../ledger/ledger_models.dart';
import 'calendar_providers.dart';

class DayTransactionsSheet extends ConsumerStatefulWidget {
  const DayTransactionsSheet({
    super.key,
    required this.dateStr,
    required this.formattedDateAr,
  });

  final String dateStr;
  final String formattedDateAr;

  static Future<void> show(
    BuildContext context, {
    required String dateStr,
    required String formattedDateAr,
  }) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => DayTransactionsSheet(
        dateStr: dateStr,
        formattedDateAr: formattedDateAr,
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
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'إغلاق',
              ),
            ],
          ),
          const Divider(height: 1),
          const SizedBox(height: SmartSpendSpacing.md),
          Expanded(
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
                        'حصل خطأ في تحميل معاملات اليوم.',
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
                            'مفيش أي معاملات مسجلة في اليوم ده. 🪙',
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
                    final isExpense = item.type == 'expense';
                    return TransactionRow(
                      icon: isExpense
                          ? Icons.shopping_bag_outlined
                          : Icons.arrow_downward_rounded,
                      title: item.category,
                      subtitle: item.description ?? item.subCategory ?? '',
                      amount: item.amount,
                      kind: isExpense ? AmountKind.expense : AmountKind.income,
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
