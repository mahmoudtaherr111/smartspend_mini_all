import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../commitments/commitment_api.dart';
import '../ledger/ledger_providers.dart';

import 'calendar_models.dart';
import 'calendar_providers.dart';

/// Sheet to settle a commitment or link it to a transaction (CAL-04).
class SettleCommitmentSheet extends ConsumerStatefulWidget {
  const SettleCommitmentSheet({super.key, required this.item});

  final CashflowItem item;

  static Future<void> show(BuildContext context, {required CashflowItem item}) {
    return showSmartSpendSheet<void>(
      context: context,
      scrollable: true,
      builder: (context) => SettleCommitmentSheet(item: item),
    );
  }

  @override
  ConsumerState<SettleCommitmentSheet> createState() =>
      _SettleCommitmentSheetState();
}

class _SettleCommitmentSheetState extends ConsumerState<SettleCommitmentSheet> {
  final _amountController = TextEditingController();
  final _amountFocus = FocusNode();
  late Future<List<PaymentSuggestionItem>> _suggestionsFuture;
  int? _selectedExpenseId;
  bool _submitting = false;
  bool _dirty = false;
  bool _confirmingDiscard = false;
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
    _amountFocus.dispose();
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

  Future<void> _handleClose() async {
    if (_confirmingDiscard) return;
    if (!_dirty) {
      if (mounted) Navigator.of(context).pop();
      return;
    }
    _confirmingDiscard = true;
    final l10n = AppLocalizations.of(context);
    final discard = await confirmInSheet(
      context: context,
      title: l10n.discardChangesTitle,
      message: l10n.discardChangesBody,
      confirmLabel: l10n.discardChangesConfirm,
      cancelLabel: l10n.discardChangesCancel,
    );
    _confirmingDiscard = false;
    if (!discard || !mounted) return;
    setState(() => _dirty = false);
    Navigator.of(context).pop();
  }

  Future<void> _settle() async {
    final amountText = _amountController.text.trim();
    final amount = amountText.isEmpty ? null : parseAmount(amountText);
    if (amountText.isNotEmpty && (amount == null || amount <= 0)) {
      setState(() {
        _error = AppLocalizations.of(context).calEnterAValidAmount;
      });
      return;
    }

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
      refreshCommitments(ref);
      refreshLedger(ref);
      if (mounted) {
        setState(() => _dirty = false);
        Navigator.of(context).pop();
      }
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
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_handleClose());
      },
      child: SmartSpendKeyboardAccessory(
        focusNodes: [_amountFocus],
        doneLabel: l10n.keyboardDone,
        child: Padding(
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
                          l10n.calSettleP0(widget.item.title),
                          style: textTheme.titleMedium,
                        ),
                        if ((widget.item.remaining ?? widget.item.amount) !=
                            null)
                          Text(
                            l10n.calAmountDueP0(
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
                    onPressed: _handleClose,
                  ),
                ],
              ),
              const SizedBox(height: SmartSpendSpacing.md),

              // Amount to settle (allows partial payment)
              TextField(
                controller: _amountController,
                focusNode: _amountFocus,
                onChanged: (_) => setState(() => _dirty = true),
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: l10n.calAmountPaidPartOfIt,
                  suffixText: MoneyLocale.of(context).symbol,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  ),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),

              // Payment suggestions / matching transactions (CAL-04)
              Text(
                l10n.calMatchingTransactions,
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
                        l10n.calNoRecentMatchingTransactionYou,
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
                              _dirty = true;
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
                          borderRadius: BorderRadius.circular(
                            SmartSpendRadii.sm,
                          ),
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
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
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
                label: l10n.calConfirmPayment,
                busy: _submitting,
                onPressed: _submitting ? null : _settle,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
            ],
          ),
        ),
      ),
    );
  }
}
