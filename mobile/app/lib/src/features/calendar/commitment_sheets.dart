import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

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
  int _dueDay = 1;
  bool _submitting = false;
  String? _error;

  static const _kinds = [
    ('rent', 'إيجار'),
    ('bill', 'فاتورة'),
    ('subscription', 'اشتراك'),
    ('school', 'مصاريف مدارس'),
    ('installment', 'قسط'),
    ('debt', 'دين أو سلفة'),
    ('gam3eya', 'جمعية'),
    ('salary', 'مرتب'),
    ('freelance', 'شغل حر'),
    ('other', 'حاجة تانية'),
  ];

  static const _recurrences = [
    ('monthly', 'كل شهر'),
    ('weekly', 'كل أسبوع'),
    ('yearly', 'كل سنة'),
    ('once', 'مرة واحدة'),
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'من فضلك اكتب اسم الالتزام أو الدخل');
      return;
    }

    final amountText = _amountController.text.trim();
    num? amount;
    if (amountText.isNotEmpty) {
      amount = num.tryParse(amountText.replaceAll(',', ''));
      if (amount == null || amount <= 0) {
        setState(() => _error = 'من فضلك اكتب مبلغ صحيح');
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
            dueDay: _dueDay,
            recurrence: _recurrence,
          );
      ref.invalidate(coachOverviewProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'حصل خطأ أثناء إضافة الالتزام. حاول تاني.';
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
                  'إضافة التزام أو دخل متوقع',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
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
            segments: const [
              ButtonSegment(
                value: 'out',
                label: Text('التزام / مصروف'),
                icon: Icon(Icons.arrow_upward_rounded),
              ),
              ButtonSegment(
                value: 'in',
                label: Text('دخل متوقع'),
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
              labelText: 'الاسم أو الوصف (مثلاً: إيجار الشقة)',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Amount
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'المبلغ (اختياري لو مش ثابت)',
              suffixText: 'ج.م',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Kind
          DropdownButtonFormField<String>(
            initialValue: _kind,
            decoration: InputDecoration(
              labelText: 'النوع',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
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
                child: DropdownButtonFormField<int>(
                  initialValue: _dueDay,
                  decoration: InputDecoration(
                    labelText: 'يوم الاستحقاق',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  items: List.generate(
                    31,
                    (i) => DropdownMenuItem(
                      value: i + 1,
                      child: Text('يوم ${i + 1}'),
                    ),
                  ),
                  onChanged: (val) {
                    if (val != null) setState(() => _dueDay = val);
                  },
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _recurrence,
                  decoration: InputDecoration(
                    labelText: 'التكرار',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
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
            label: 'حفظ الالتزام',
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
    _amountController.text = widget.item.amount?.toString() ?? '';
    _suggestionsFuture = ref
        .read(calendarApiProvider)
        .getPaymentSuggestions(widget.item.id);
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
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
            cashflowId: widget.item.id,
            expenseId: _selectedExpenseId,
            amount: amount,
          );
      ref.invalidate(coachOverviewProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'حصل خطأ أثناء السداد. حاول تاني.';
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
                      'سداد: ${widget.item.title}',
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (widget.item.amount != null)
                      Text(
                        'المبلغ المستحق: ${widget.item.amount!.toStringAsFixed(0)} ج.م',
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
              labelText: 'مبلغ السداد (يمكنك كتابة جزء من المبلغ)',
              suffixText: 'ج.م',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Payment suggestions / matching transactions (CAL-04)
          Text(
            'المعاملات المقترحة للمطابقة:',
            style: textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.bold,
              color: colors.foreground,
            ),
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
                    'مفيش معاملات مطابقة مسجلة حديثاً. تقدر تسدد بالمبلغ مباشرة.',
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
                            _amountController.text = s.amount.toString();
                          }
                        });
                      },
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.all(SmartSpendSpacing.sm),
                        decoration: BoxDecoration(
                          color: _selectedExpenseId == s.id
                              ? colors.accent.withValues(alpha: 0.1)
                              : colors.background,
                          borderRadius: BorderRadius.circular(10),
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
                                    '${s.category}: ${s.amount.toStringAsFixed(0)} ج.م',
                                    style: textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
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
            label: 'تأكيد السداد',
            busy: _submitting,
            onPressed: _submitting ? null : _settle,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
        ],
      ),
    );
  }
}
