import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'calendar_models.dart';
import 'calendar_providers.dart';

/// Sheet to add a new recurring commitment or expected income (CAL-03).
class AddCommitmentSheet extends ConsumerStatefulWidget {
  const AddCommitmentSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => const AddCommitmentSheet(),
    );
  }

  @override
  ConsumerState<AddCommitmentSheet> createState() => _AddCommitmentSheetState();
}

class _AddCommitmentSheetState extends ConsumerState<AddCommitmentSheet> {
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  String _direction = 'out'; // 'out' = commitment, 'in' = income
  String _kind = 'bill';
  String _recurrence = 'monthly';

  /// The first (or only) due date, a Cairo day key; today on the server's clock until the user picks one.
  late String _startDay =
      ref.read(coachOverviewProvider).value?.today ?? dayKeyOf(DateTime.now());
  bool _submitting = false;
  String? _error;

  List<(String, String)> get _kinds => [
    ('rent', AppLocalizations.of(context).calRent),
    ('bill', AppLocalizations.of(context).calBill),
    ('subscription', AppLocalizations.of(context).calSubscription),
    ('school', AppLocalizations.of(context).calSchoolFees),
    ('installment', AppLocalizations.of(context).calInstallment),
    ('debt', AppLocalizations.of(context).calDebtOrLoan),
    ('gam3eya', AppLocalizations.of(context).calSavingsCircle),
    ('salary', AppLocalizations.of(context).calSalary),
    ('freelance', AppLocalizations.of(context).calFreelance),
    ('other', AppLocalizations.of(context).calSomethingElse),
  ];

  List<(String, String)> get _recurrences => [
    ('monthly', AppLocalizations.of(context).calEveryMonth),
    ('weekly', AppLocalizations.of(context).calEveryWeek),
    ('yearly', AppLocalizations.of(context).calEveryYear),
    ('once', AppLocalizations.of(context).calOnce),
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  /// «16 أكتوبر 2026» for a day key.
  String _dayLabel(String dayKey) {
    final day = DateTime.tryParse(dayKey);
    return day == null ? dayKey : DateWords.of(context).date(day);
  }

  Future<void> _pickStartDay() async {
    final today =
        DateTime.tryParse(ref.read(coachOverviewProvider).value?.today ?? '') ??
        DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_startDay) ?? today,
      firstDate: DateTime(today.year - 5),
      lastDate: DateTime(today.year + 5, 12, 31),
    );
    if (picked != null && mounted) {
      setState(() => _startDay = dayKeyOf(picked));
    }
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = AppLocalizations.of(context).calEnterAName);
      return;
    }

    final amountText = _amountController.text.trim();
    num? amount;
    if (amountText.isNotEmpty) {
      amount = num.tryParse(amountText.replaceAll(',', ''));
      if (amount == null || amount <= 0) {
        setState(
          () => _error = AppLocalizations.of(context).calEnterAValidAmount,
        );
        return;
      }
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(calendarApiProvider)
          .addCashflow(
            title: title,
            kind: _kind,
            direction: _direction,
            amount: amount,
            startDay: _startDay,
            recurrence: _recurrence,
          );
      ref.invalidate(coachOverviewProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = AppLocalizations.of(context).calWeCouldnTAddIt;
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
                child: Text(
                  AppLocalizations.of(context).calAddACommitmentOrExpected,
                  style: textTheme.titleMedium,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Direction Segmented Control
          SegmentedButton<String>(
            segments: [
              ButtonSegment(
                value: 'out',
                label: Text(AppLocalizations.of(context).calCommitment),
                icon: Icon(Icons.arrow_upward_rounded),
              ),
              ButtonSegment(
                value: 'in',
                label: Text(AppLocalizations.of(context).calExpectedIncome),
                icon: Icon(Icons.arrow_downward_rounded),
              ),
            ],
            selected: {_direction},
            onSelectionChanged: (set) {
              setState(() {
                _direction = set.first;
                if (_direction == 'in' && _kind == 'bill') {
                  _kind = 'salary';
                } else if (_direction == 'out' && _kind == 'salary') {
                  _kind = 'bill';
                }
              });
            },
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Title
          TextField(
            controller: _titleController,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context).calNameLikeTheRent,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Amount
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context)
                  .calAmountOptionalIfItChanges,
              suffixText: MoneyLocale.of(context).symbol,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Kind
          DropdownButtonFormField<String>(
            initialValue: _kind,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context).calKind,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              ),
            ),
            items: _kinds
                .map((k) => DropdownMenuItem(value: k.$1, child: Text(k.$2)))
                .toList(),
            onChanged: (val) {
              if (val != null) setState(() => _kind = val);
            },
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Due day & Recurrence in a row
          Row(
            children: [
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  onTap: _pickStartDay,
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context).calDueDay,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                      ),
                    ),
                    child: Text(_dayLabel(_startDay)),
                  ),
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _recurrence,
                  decoration: InputDecoration(
                    labelText: AppLocalizations.of(context).calRepeats,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                  items: _recurrences
                      .map(
                        (r) => DropdownMenuItem(value: r.$1, child: Text(r.$2)),
                      )
                      .toList(),
                  onChanged: (val) {
                    if (val != null) setState(() => _recurrence = val);
                  },
                ),
              ),
            ],
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
            label: AppLocalizations.of(context).calSave,
            busy: _submitting,
            onPressed: _submitting ? null : _submit,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
        ],
      ),
    );
  }
}

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
