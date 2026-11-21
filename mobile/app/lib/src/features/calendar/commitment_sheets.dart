import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'calendar_models.dart';
import 'calendar_providers.dart';

/// Sheet to settle a commitment or link it to a transaction (CAL-04).
class SettleCommitmentSheet extends ConsumerStatefulWidget {
  const SettleCommitmentSheet({super.key, required this.item});

  final CashflowItem item;

  static Future<void> show(BuildContext context, {required CashflowItem item}) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => SettleCommitmentSheet(item: item),
    );
  }

  @override
  ConsumerState<SettleCommitmentSheet> createState() =>
      _SettleCommitmentSheetState();
}

class _SettleCommitmentSheetState extends ConsumerState<SettleCommitmentSheet> {
  final _amountController = TextEditingController();
  late Future<List<PaymentSuggestionItem>> _suggestionsFuture;
  int? _selectedExpenseId;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // What is still owed on this date: the whole amount, or the rest after a partial payment.
    _amountController.text = _plain(
      widget.item.remaining ?? widget.item.amount,
    );
    _suggestionsFuture = ref
        .read(calendarApiProvider)
        .getPaymentSuggestions(
          cashflowId: widget.item.cashflowId,
          dueDay: widget.item.dueDay,
        );
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  /// "2500" or "2500.5": a number as the amount field holds it, without grouping; empty for none.
  static String _plain(num? amount) {
    if (amount == null) return '';
    return amount == amount.roundToDouble()
        ? amount.toInt().toString()
        : amount.toString();
  }

  Future<void> _settle() async {
    final amountText = _amountController.text.trim();
    final amount = num.tryParse(amountText.replaceAll(',', ''));

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(calendarApiProvider)
          .settle(
            cashflowId: widget.item.cashflowId,
            dueDay: widget.item.dueDay,
            expenseId: _selectedExpenseId,
            amount: amount,
          );
      ref.invalidate(coachOverviewProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = AppLocalizations.of(context).calWeCouldnTRecordThe;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppLocalizations.of(context)
                          .calSettleP0(widget.item.title),
                      style: textTheme.titleMedium,
                    ),
                    if ((widget.item.remaining ?? widget.item.amount) != null)
                      Text(
                        AppLocalizations.of(context).calAmountDueP0(
                          moneyText(
                            context,
                            (widget.item.remaining ?? widget.item.amount)!,
                          ),
                        ),
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Amount to settle (allows partial payment)
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context).calAmountPaidPartOfIt,
              suffixText: MoneyLocale.of(context).symbol,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Payment suggestions / matching transactions (CAL-04)
          Text(
            AppLocalizations.of(context).calMatchingTransactions,
            style: textTheme.labelLarge?.copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),

          FutureBuilder<List<PaymentSuggestionItem>>(
            future: _suggestionsFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(SmartSpendSpacing.md),
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              final suggestions = snapshot.data ?? const [];
              if (suggestions.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: SmartSpendSpacing.sm,
                  ),
                  child: Text(
                    AppLocalizations.of(context)
                        .calNoRecentMatchingTransactionYou,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                );
              }

              return Column(
                children: [
                  for (final s in suggestions)
                    InkWell(
                      onTap: () {
                        setState(() {
                          if (_selectedExpenseId == s.id) {
                            _selectedExpenseId = null;
                          } else {
                            _selectedExpenseId = s.id;
                            // What is left of the payment, up to what is owed on this date.
                            final owed = widget.item.remaining;
                            _amountController.text = _plain(
                              owed != null && owed < s.available
                                  ? owed
                                  : s.available,
                            );
                          }
                        });
                      },
                      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                      child: Container(
                        margin: const EdgeInsets.symmetric(
                          vertical: SmartSpendSpacing.xs,
                        ),
                        padding: const EdgeInsets.all(SmartSpendSpacing.sm),
                        decoration: BoxDecoration(
                          color: _selectedExpenseId == s.id
                              ? colors.accent.withValues(alpha: 0.1)
                              : colors.background,
                          borderRadius: BorderRadius.circular(
                            SmartSpendRadii.sm,
                          ),
                          border: Border.all(
                            color: _selectedExpenseId == s.id
                                ? colors.accent
                                : colors.border,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _selectedExpenseId == s.id
                                  ? Icons.radio_button_checked_rounded
                                  : Icons.radio_button_off_rounded,
                              color: _selectedExpenseId == s.id
                                  ? colors.accent
                                  : colors.mutedForeground,
                              size: 20,
                            ),
                            const SizedBox(width: SmartSpendSpacing.sm),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${s.category}: ${moneyText(context, s.amount)}',
                                    style: textTheme.titleSmall,
                                  ),
                                  if (s.description != null &&
                                      s.description!.isNotEmpty)
                                    Text(
                                      s.description!,
                                      style: textTheme.bodySmall?.copyWith(
                                        color: colors.mutedForeground,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          if (_error != null) ...[
            Text(
              _error!,
              style: textTheme.bodySmall?.copyWith(color: colors.danger),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],

          SmartSpendButton(
            label: AppLocalizations.of(context).calConfirmPayment,
            busy: _submitting,
            onPressed: _submitting ? null : _settle,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
        ],
      ),
    );
  }
}
