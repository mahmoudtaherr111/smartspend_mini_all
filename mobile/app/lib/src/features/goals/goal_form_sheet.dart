import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
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
      setState(() => _error = AppLocalizations.of(context).monEnterANameForThe);
      return;
    }

    final rawAmount = _amountController.text.trim();
    final amount = parseAmount(rawAmount)?.toDouble();
    if (amount == null || amount <= 0) {
      setState(
        () => _error = AppLocalizations.of(context).monEnterTheTargetAmount,
      );
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
          _error = AppLocalizations.of(context).monWeCouldnTCreateThe;
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
                    AppLocalizations.of(context).monNewSavingGoal,
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.foreground,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: AppLocalizations.of(context).monClose,
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
              AppLocalizations.of(context).monGoalName,
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: colors.mutedForeground,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                hintText: AppLocalizations.of(context).monLikeUmrahANewLaptop,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Target amount input (REQUIRED)
            Text(
              AppLocalizations.of(context).monTargetAmountRequired,
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
                FilteringTextInputFormatter.allow(
                  RegExp(r'^[0-9٠-٩]*\.?[0-9٠-٩]*'),
                ),
              ],
              decoration: InputDecoration(
                hintText: AppLocalizations.of(context).monLike25000,
                suffixText: MoneyLocale.of(context).symbol,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            // Target date picker
            Text(
              AppLocalizations.of(context).monTargetDateOptional,
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
                          : AppLocalizations.of(context).monChooseADate,
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
              AppLocalizations.of(context).monNotesOptional,
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
                hintText: AppLocalizations.of(context)
                    .monAnythingThatHelpsYouRemember,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  borderSide: BorderSide(color: colors.border),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: _submitting
                  ? AppLocalizations.of(context).monCreating
                  : AppLocalizations.of(context).monCreateTheGoal,
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
