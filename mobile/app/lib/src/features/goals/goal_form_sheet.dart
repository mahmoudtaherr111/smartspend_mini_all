import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'goals_providers.dart';

/// Bottom sheet to create a new financial goal (`goals.create`).
/// Enforces a required target amount (fixing GAP-16 where web defaulted to 50,000 EGP).
class GoalFormSheet extends ConsumerStatefulWidget {
  const GoalFormSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showSmartSpendSheet<bool>(
      context: context,
      builder: (context) => const GoalFormSheet(),
    );
  }

  @override
  ConsumerState<GoalFormSheet> createState() => _GoalFormSheetState();
}

class _GoalFormSheetState extends ConsumerState<GoalFormSheet> {
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  final _descController = TextEditingController();
  DateTime? _selectedDate;

  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _amountController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? now.add(const Duration(days: 90)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 10)),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'من فضلك اكتب اسم الهدف');
      return;
    }

    final rawAmount = _amountController.text.trim();
    final amount = double.tryParse(rawAmount);
    if (amount == null || amount <= 0) {
      setState(() => _error = 'من فضلك اكتب المبلغ المستهدف للهدف');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final notifier = ref.read(goalsProvider.notifier);
      await notifier.createGoal(
        title: title,
        description: _descController.text.trim().isEmpty
            ? null
            : _descController.text.trim(),
        targetAmount: amount,
        targetDate: _selectedDate,
      );

      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'حصلت مشكلة أثناء إنشاء الهدف، اتأكد من اتصالك وجرّب تاني';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.only(
        top: SmartSpendSpacing.lg,
        left: SmartSpendSpacing.screen,
        right: SmartSpendSpacing.screen,
        bottom: MediaQuery.of(context).viewInsets.bottom + SmartSpendSpacing.xl,
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
                    'هدف توفير جديد',
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.foreground,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'إغلاق',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(SmartSpendSpacing.sm),
                decoration: BoxDecoration(
                  color: colors.danger.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                ),
                child: Text(
                  _error!,
                  style: TextStyle(color: colors.danger, fontSize: 13),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
            ],
            // Title input
            Text(
              'اسم الهدف',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                hintText: 'مثلاً: عمرة، لابتوب جديد، صيانة العربية',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Target amount input (REQUIRED)
            Text(
              'المبلغ المستهدف (مطلوب)',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
              ],
              decoration: InputDecoration(
                hintText: 'مثلاً: 25000',
                suffixText: 'ج.م',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Target date picker
            Text(
              'تاريخ الوصول للهدف (اختياري)',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 14,
                ),
                decoration: BoxDecoration(
                  border: Border.all(color: colors.border),
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.calendar_today_rounded,
                      size: 18,
                      color: colors.accent,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _selectedDate != null
                          ? '${_selectedDate!.year}/${_selectedDate!.month}/${_selectedDate!.day}'
                          : 'حدد تاريخ مستهدف',
                      style: textTheme.bodyMedium?.copyWith(
                        color: _selectedDate != null
                            ? colors.foreground
                            : colors.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Description input (optional)
            Text(
              'ملاحظات إضافية (اختياري)',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            TextField(
              controller: _descController,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'أي تفاصيل تساعدك تفتكر خطتك...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: _submitting ? 'جاري الإنشاء...' : 'إنشاء الهدف',
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
