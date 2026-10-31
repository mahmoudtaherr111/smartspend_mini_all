import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

/// Bottom sheet to add a custom business category (BIZ-02).
class AddBusinessCategorySheet extends StatefulWidget {
  const AddBusinessCategorySheet({super.key, required this.onAdd});

  final Future<void> Function({
    required String name,
    required String nameAr,
    required String type,
    required String icon,
    required String color,
  }) onAdd;

  static Future<void> show(
    BuildContext context, {
    required Future<void> Function({
      required String name,
      required String nameAr,
      required String type,
      required String icon,
      required String color,
    }) onAdd,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddBusinessCategorySheet(onAdd: onAdd),
    );
  }

  @override
  State<AddBusinessCategorySheet> createState() => _AddBusinessCategorySheetState();
}

class _AddBusinessCategorySheetState extends State<AddBusinessCategorySheet> {
  final _nameController = TextEditingController();
  String _type = 'expense';
  String _icon = '🛍️';
  final _color = '#3b82f6';
  bool _saving = false;

  static const _emojis = ['🛍️', '🍤', '🔧', '💻', '📦', '🚚', '📊', '🧾', '💰', '🏢'];

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _nameController.text.trim();
    if (text.isEmpty) return;

    setState(() => _saving = true);
    try {
      await widget.onAdd(
        name: text,
        nameAr: text,
        type: _type,
        icon: _icon,
        color: _color,
      );
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(SmartSpendRadii.sheet),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'إضافة فئة للمشروع',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colors.foreground,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'اسم الفئة (مثال: بضاعة، إيجار المحل، خامات)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'expense', label: Text('مصروف')),
                ButtonSegment(value: 'income', label: Text('إيراد / مبيعات')),
              ],
              selected: {_type},
              onSelectionChanged: (set) {
                if (set.isNotEmpty) setState(() => _type = set.first);
              },
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Text('الأيقونة', style: textTheme.labelLarge),
            const SizedBox(height: SmartSpendSpacing.xs),
            Wrap(
              spacing: SmartSpendSpacing.sm,
              children: [
                for (final emoji in _emojis)
                  ChoiceChip(
                    label: Text(emoji, style: const TextStyle(fontSize: 18)),
                    selected: _icon == emoji,
                    onSelected: (sel) {
                      if (sel) setState(() => _icon = emoji);
                    },
                  ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            FilledButton(
              onPressed: _saving ? null : _submit,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('إضافة الفئة'),
            ),
          ],
        ),
      ),
    );
  }
}
