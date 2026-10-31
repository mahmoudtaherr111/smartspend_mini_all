import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../ledger/category_style.dart';
import 'budget_models.dart';
import 'budget_providers.dart';

const String _allCategories = '__all__';

/// Bottom sheet to create or edit a budget (`budget.create` / `budget.update`).
class BudgetFormSheet extends ConsumerStatefulWidget {
  const BudgetFormSheet({super.key, this.existing});

  final BudgetStatus? existing;

  static Future<bool?> show(BuildContext context, {BudgetStatus? existing}) {
    return showSmartSpendSheet<bool>(
      context: context,
      builder: (context) => BudgetFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<BudgetFormSheet> createState() => _BudgetFormSheetState();
}

class _BudgetFormSheetState extends ConsumerState<BudgetFormSheet> {
  late final TextEditingController _titleController;
  late final TextEditingController _limitController;
  late String _selectedCategory;
  late int _periodStartDay;
  late int _alertThresholdPercent;

  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _selectedCategory = existing?.category ?? _allCategories;
    _titleController = TextEditingController(
      text: existing?.title ??
          (_selectedCategory == _allCategories ? 'الميزانية العامة' : _selectedCategory),
    );
    _limitController = TextEditingController(
      text: existing != null ? existing.monthlyLimit.toStringAsFixed(0) : '',
    );
    _periodStartDay = existing?.periodStartDay ?? 1;
    _alertThresholdPercent = existing?.alertThresholdPercent ?? 80;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _limitController.dispose();
    super.dispose();
  }

  void _onCategoryChanged(String value) {
    setState(() {
      _selectedCategory = value;
      // Auto-update title if user hasn't typed a custom title
      if (_titleController.text.trim().isEmpty ||
          _titleController.text.trim() == 'الميزانية العامة' ||
          categoriesForType('expense').contains(_titleController.text.trim())) {
        _titleController.text =
            value == _allCategories ? 'الميزانية العامة' : value;
      }
    });
  }

  Future<void> _submit() async {
    final rawLimit = _limitController.text.trim();
    final limit = double.tryParse(rawLimit);
    if (limit == null || limit <= 0) {
      setState(() => _error = 'من فضلك اكتب مبلغ الميزانية الشهري');
      return;
    }

    final title = _titleController.text.trim().isEmpty
        ? (_selectedCategory == _allCategories ? 'الميزانية العامة' : _selectedCategory)
        : _titleController.text.trim();

    final categoryArg =
        _selectedCategory == _allCategories ? null : _selectedCategory;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final notifier = ref.read(budgetsProvider.notifier);
      if (widget.existing != null) {
        await notifier.updateBudget(
          budgetId: widget.existing!.id,
          title: title,
          category: categoryArg,
          monthlyLimit: limit,
          periodStartDay: _periodStartDay,
          alertThresholdPercent: _alertThresholdPercent,
        );
      } else {
        await notifier.createBudget(
          title: title,
          category: categoryArg,
          monthlyLimit: limit,
          periodStartDay: _periodStartDay,
          alertThresholdPercent: _alertThresholdPercent,
        );
      }

      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'حصلت مشكلة أثناء الحفظ، جرّب تاني بعد لحظات';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final expenseCategories = categoriesForType('expense');
    final isEditing = widget.existing != null;

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
                    isEditing ? 'تعديل الميزانية' : 'ميزانية شهرية جديدة',
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
            // Category selector dropdown
            Text(
              'التصنيف',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                border: Border.all(color: colors.border),
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedCategory,
                  isExpanded: true,
                  dropdownColor: colors.surface,
                  icon: Icon(Icons.arrow_drop_down_rounded, color: colors.mutedForeground),
                  items: [
                    const DropdownMenuItem(
                      value: _allCategories,
                      child: Text('الميزانية العامة (كل المصاريف)'),
                    ),
                    ...expenseCategories.map(
                      (cat) => DropdownMenuItem(
                        value: cat,
                        child: Row(
                          children: [
                            Icon(categoryIcon(cat), size: 18, color: colors.accent),
                            const SizedBox(width: 8),
                            Text(cat),
                          ],
                        ),
                      ),
                    ),
                  ],
                  onChanged: (val) {
                    if (val != null) _onCategoryChanged(val);
                  },
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Title input
            Text(
              'اسم الميزانية',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                hintText: 'مثلاً: ميزانية الأكل والشرب',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Monthly limit input
            Text(
              'المبلغ الشهري الأقصى',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            TextField(
              controller: _limitController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
              ],
              decoration: InputDecoration(
                hintText: '5000',
                suffixText: 'ج.م',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Alert Threshold chips
            Text(
              'تنبيه عند بلوغ نسبة',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            Wrap(
              spacing: 8,
              children: [70, 80, 90].map((percent) {
                final selected = _alertThresholdPercent == percent;
                return ChoiceChip(
                  label: Text('$percent%'),
                  selected: selected,
                  selectedColor: colors.accent.withValues(alpha: 0.2),
                  onSelected: (val) {
                    if (val) setState(() => _alertThresholdPercent = percent);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: _submitting
                  ? 'جاري الحفظ...'
                  : (isEditing ? 'حفظ التعديلات' : 'إضافة الميزانية'),
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
