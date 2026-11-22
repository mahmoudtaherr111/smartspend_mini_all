import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/cairo_time.dart';
import '../../l10n/app_localizations.dart';
import 'goal_models.dart';
import 'goals_providers.dart';

/// Bottom sheet to create or edit a financial goal (`goals.create`).
/// Enforces a required target amount (fixing GAP-16 where web defaulted to 50,000 EGP).
class GoalFormSheet extends ConsumerStatefulWidget {
  const GoalFormSheet({super.key, this.existing});

  final Goal? existing;

  static Future<bool?> show(BuildContext context, {Goal? existing}) {
    return showSmartSpendSheet<bool>(
      context: context,
      scrollable: true,
      builder: (context) => GoalFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<GoalFormSheet> createState() => _GoalFormSheetState();
}

class _GoalFormSheetState extends ConsumerState<GoalFormSheet> {
  late final TextEditingController _titleController;
  late final TextEditingController _amountController;
  late final TextEditingController _descController;
  final _amountFocusNode = FocusNode();
  DateTime? _selectedDate;

  late final String _initialTitle;
  late final String _initialAmount;
  late final String _initialDesc;
  late final DateTime? _initialDate;

  bool _submitting = false;
  String? _error;

  static String _plainAmount(double value) => value == value.roundToDouble()
      ? value.round().toString()
      : value.toStringAsFixed(2);

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _initialTitle = (existing?.title ?? '').trim();
    _initialAmount = existing != null
        ? _plainAmount(existing.targetAmount)
        : '';
    _initialDesc = (existing?.description ?? '').trim();
    _initialDate = existing?.targetDate;
    _selectedDate = _initialDate;

    _titleController = TextEditingController(text: _initialTitle)
      ..addListener(_onChanged);
    _amountController = TextEditingController(text: _initialAmount)
      ..addListener(_onChanged);
    _descController = TextEditingController(text: _initialDesc)
      ..addListener(_onChanged);
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  bool get _isDirty =>
      _titleController.text.trim() != _initialTitle ||
      _amountController.text.trim() != _initialAmount ||
      _descController.text.trim() != _initialDesc ||
      _selectedDate != _initialDate;

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
    _titleController
      ..removeListener(_onChanged)
      ..dispose();
    _amountController
      ..removeListener(_onChanged)
      ..dispose();
    _descController
      ..removeListener(_onChanged)
      ..dispose();
    _amountFocusNode.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = cairoNowDate();
    final initial = _selectedDate != null && !_selectedDate!.isBefore(now)
        ? _selectedDate!
        : now.add(const Duration(days: 90));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 10)),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = l10n.monEnterANameForThe);
      return;
    }

    final rawAmount = _amountController.text.trim();
    final amount = parseAmount(rawAmount)?.toDouble();
    if (amount == null || amount <= 0) {
      setState(() => _error = l10n.monEnterTheTargetAmount);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final notifier = ref.read(goalsProvider.notifier);
      final description = _descController.text.trim().isEmpty
          ? null
          : _descController.text.trim();

      if (widget.existing != null) {
        await notifier.updateGoal(
          goalId: widget.existing!.id,
          title: title,
          description: description,
          targetAmount: amount,
          targetDate: _selectedDate,
          status: widget.existing!.status,
        );
      } else {
        await notifier.createGoal(
          title: title,
          description: description,
          targetAmount: amount,
          targetDate: _selectedDate,
        );
      }

      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = widget.existing != null
              ? l10n.saveChangesFailed
              : l10n.monWeCouldnTCreateThe;
        });
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
      canPop: !_isDirty || _submitting,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final discard = await _confirmDiscard(context);
        if (discard && context.mounted) {
          Navigator.of(context).pop(false);
        }
      },
      child: SmartSpendKeyboardAccessory(
        focusNodes: [_amountFocusNode],
        doneLabel: l10n.keyboardDone,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            SmartSpendSpacing.screen,
            SmartSpendSpacing.lg,
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
                      isEditing ? l10n.goalEditTitle : l10n.monNewSavingGoal,
                      style: textTheme.titleMedium?.copyWith(
                        color: colors.foreground,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    tooltip: l10n.monClose,
                    onPressed: () => Navigator.of(context).maybePop(),
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
                    style: textTheme.bodyMedium?.copyWith(color: colors.danger),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
              ],
              // Title input
              Text(
                l10n.monGoalName,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              TextField(
                controller: _titleController,
                decoration: InputDecoration(
                  hintText: l10n.monLikeUmrahANewLaptop,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Target amount input (REQUIRED)
              Text(
                l10n.monTargetAmountRequired,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              TextField(
                controller: _amountController,
                focusNode: _amountFocusNode,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                    RegExp(r'^[0-9٠-٩]*\.?[0-9٠-٩]*'),
                  ),
                ],
                decoration: InputDecoration(
                  hintText: l10n.monLike25000,
                  suffixText: MoneyLocale.of(context).symbol,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Target date picker
              Text(
                l10n.monTargetDateOptional,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                child: InputDecorator(
                  decoration: const InputDecoration(),
                  child: Row(
                    children: [
                      Icon(
                        Icons.calendar_today_rounded,
                        size: 18,
                        color: colors.accent,
                      ),
                      const SizedBox(width: SmartSpendSpacing.sm),
                      Expanded(
                        child: Text(
                          _selectedDate != null
                              ? DateWords.of(context).date(_selectedDate!)
                              : l10n.monChooseADate,
                          style: textTheme.bodyMedium?.copyWith(
                            color: _selectedDate != null
                                ? colors.foreground
                                : colors.mutedForeground,
                          ),
                        ),
                      ),
                      if (_selectedDate != null)
                        InkWell(
                          onTap: () => setState(() => _selectedDate = null),
                          child: Icon(
                            Icons.clear_rounded,
                            size: 18,
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Description input (optional)
              Text(
                l10n.monNotesOptional,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              TextField(
                controller: _descController,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: l10n.monAnythingThatHelpsYouRemember,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.lg),
              SmartSpendButton(
                label: _submitting
                    ? (isEditing ? l10n.monSaving : l10n.monCreating)
                    : (isEditing ? l10n.monSaveChanges : l10n.monCreateTheGoal),
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
