import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'installment_models.dart';
import 'installments_providers.dart';

/// Bottom sheet to add an installment plan (`expense.createInstallmentPlan`).
class InstallmentFormSheet extends ConsumerStatefulWidget {
  const InstallmentFormSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showSmartSpendSheet<bool>(
      context: context,
      builder: (context) => const InstallmentFormSheet(),
    );
  }

  @override
  ConsumerState<InstallmentFormSheet> createState() =>
      _InstallmentFormSheetState();
}

class _InstallmentFormSheetState extends ConsumerState<InstallmentFormSheet> {
  final _titleController = TextEditingController();
  final _keywordController = TextEditingController();
  final _amountController = TextEditingController();
  final _totalController = TextEditingController();
  final _paidBeforeController = TextEditingController(text: '0');

  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _keywordController.dispose();
    _amountController.dispose();
    _totalController.dispose();
    _paidBeforeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    final keyword = _keywordController.text.trim().isEmpty
        ? title
        : _keywordController.text.trim();
    final amount = double.tryParse(_amountController.text.trim()) ?? 0.0;
    final total = int.tryParse(_totalController.text.trim()) ?? 0;
    final paidBefore = int.tryParse(_paidBeforeController.text.trim()) ?? 0;

    if (title.length < 2) {
      setState(() => _error = 'اكتب اسم القسط (حرفين على الأقل)');
      return;
    }
    if (amount <= 0) {
      setState(() => _error = 'اكتب قيمة القسط الشهري');
      return;
    }
    if (total < 1) {
      setState(() => _error = 'اكتب إجمالي عدد الأقساط (قسط واحد على الأقل)');
      return;
    }
    if (paidBefore < 0 || paidBefore > total) {
      setState(
        () => _error = 'عدد الأقساط المدفوعة لازم يكون بين 0 وإجمالي الأقساط',
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final input = CreateInstallmentInput(
        title: title,
        keyword: keyword,
        monthlyAmount: amount,
        totalInstallments: total,
        paidBefore: paidBefore,
      );
      final ok = await ref
          .read(installmentsProvider.notifier)
          .createPlan(input);
      if (!mounted) return;
      if (ok) {
        if (!mounted) return;
        Navigator.of(context).pop(true);
      } else {
        setState(() {
          _submitting = false;
          _error = 'ماعرفناش نضيف القسط، اتأكد من النت وجرب تاني';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'حصل خطأ: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final media = MediaQuery.of(context);
    final bottomInset = media.viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(
        left: SmartSpendSpacing.screen,
        right: SmartSpendSpacing.screen,
        top: SmartSpendSpacing.lg,
        bottom: bottomInset + SmartSpendSpacing.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'إضافة قسط جديد',
                    style: SmartSpendTypography.style(
                      20,
                      FontWeight.w700,
                    ).copyWith(color: colors.foreground),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'إغلاق',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Text(
              'كل ما تسجل مصروف فيه كلمة القسط (زي «دفعت قسط فاليو 800») هنعدّه تلقائياً ونقولك باقي كام.',
              style: SmartSpendTypography.style(
                13,
                FontWeight.w400,
              ).copyWith(color: colors.mutedForeground),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(SmartSpendSpacing.sm),
                decoration: BoxDecoration(
                  color: colors.danger.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  border: Border.all(
                    color: colors.danger.withValues(alpha: 0.3),
                  ),
                ),
                child: Text(
                  _error!,
                  style: SmartSpendTypography.style(
                    13,
                    FontWeight.w500,
                  ).copyWith(color: colors.danger),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
            ],
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'اسم القسط *',
                hintText: 'مثلاً: موبايل فاليو أو قسط التكييف',
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _keywordController,
              decoration: const InputDecoration(
                labelText: 'كلمة الدفع (اختياري)',
                hintText: 'مثلاً: فاليو (لو سبتها فاضية هناخد اسم القسط)',
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _amountController,
              decoration: const InputDecoration(
                labelText: 'القسط كام في الشهر (ج.م) *',
                hintText: 'مثلاً: 850',
                suffixText: 'ج.م',
              ),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
              ],
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _totalController,
                    decoration: const InputDecoration(
                      labelText: 'إجمالي الأقساط *',
                      hintText: 'مثلاً: 12',
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    textInputAction: TextInputAction.next,
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: TextField(
                    controller: _paidBeforeController,
                    decoration: const InputDecoration(
                      labelText: 'مدفوع منه كام',
                      hintText: '0',
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: 'حفظ القسط',
              busy: _submitting,
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
