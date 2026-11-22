import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'business_models.dart';

/// Bottom sheet to add or edit a custom business category (BIZ-02).
class AddBusinessCategorySheet extends StatefulWidget {
  const AddBusinessCategorySheet({
    super.key,
    required this.onAdd,
    this.existing,
  });

  final BusinessCategory? existing;

  final Future<void> Function({
    required String name,
    required String nameAr,
    required String type,
    required String icon,
    required String color,
  })
  onAdd;

  static Future<void> show(
    BuildContext context, {
    BusinessCategory? existing,
    required Future<void> Function({
      required String name,
      required String nameAr,
      required String type,
      required String icon,
      required String color,
    })
    onAdd,
  }) {
    return showSmartSpendSheet<void>(
      context: context,
      scrollable: true,
      builder: (_) =>
          AddBusinessCategorySheet(existing: existing, onAdd: onAdd),
    );
  }

  @override
  State<AddBusinessCategorySheet> createState() =>
      _AddBusinessCategorySheetState();
}

class _AddBusinessCategorySheetState extends State<AddBusinessCategorySheet> {
  late final TextEditingController _nameController;
  late String _type;
  late String _icon;
  late final String _color;
  bool _saving = false;

  late final String _initialName;
  late final String _initialType;
  late final String _initialIcon;

  static const _emojis = [
    '🛍️',
    '🍤',
    '🔧',
    '💻',
    '📦',
    '🚚',
    '📊',
    '🧾',
    '💰',
    '🏢',
  ];

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _initialName = (existing?.nameAr ?? '').trim();
    _initialType = existing?.type ?? 'expense';
    _initialIcon = existing?.icon ?? '🛍️';
    _nameController = TextEditingController(text: _initialName)
      ..addListener(_onChanged);
    _type = _initialType;
    _icon = _initialIcon;
    _color = existing?.color ?? '#3b82f6';
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  bool get _isDirty =>
      _nameController.text.trim() != _initialName ||
      _type != _initialType ||
      _icon != _initialIcon;

  Future<bool> _confirmDiscard(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text(l10n.discardChangesTitle),
        content: Text(l10n.discardChangesBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: Text(l10n.discardChangesCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: Text(l10n.discardChangesConfirm),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  @override
  void dispose() {
    _nameController
      ..removeListener(_onChanged)
      ..dispose();
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
      if (mounted) {
        setState(() => _saving = false);
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).saveChangesFailed,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isEditing = widget.existing != null;

    return PopScope(
      canPop: !_isDirty || _saving,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final discard = await _confirmDiscard(context);
        if (discard && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          SmartSpendSpacing.screen,
          0,
          SmartSpendSpacing.screen,
          SmartSpendSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    isEditing
                        ? l10n.businessCategoryEditTitle
                        : l10n.aiAddACategory,
                    style: textTheme.titleMedium?.copyWith(
                      color: colors.foreground,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: l10n.aiCategoryNameLikeStockShop,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'expense', label: Text(l10n.aiExpense)),
                ButtonSegment(
                  value: 'income',
                  label: Text(l10n.aiIncomeOrSales),
                ),
              ],
              selected: {_type},
              onSelectionChanged: (set) {
                if (set.isNotEmpty) setState(() => _type = set.first);
              },
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Text(l10n.aiIcon, style: textTheme.labelLarge),
            const SizedBox(height: SmartSpendSpacing.xs),
            Wrap(
              spacing: SmartSpendSpacing.sm,
              runSpacing: SmartSpendSpacing.xs,
              children: [
                for (final emoji in _emojis)
                  ChoiceChip(
                    label: Text(emoji, style: textTheme.titleLarge),
                    selected: _icon == emoji,
                    onSelected: (sel) {
                      if (sel) setState(() => _icon = emoji);
                    },
                  ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: isEditing ? l10n.monSaveChanges : l10n.aiAddTheCategory,
              busy: _saving,
              onPressed: _saving ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
