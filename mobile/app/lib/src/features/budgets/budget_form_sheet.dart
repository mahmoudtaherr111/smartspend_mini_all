import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
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
      scrollable: true,
      builder: (context) => BudgetFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<BudgetFormSheet> createState() => _BudgetFormSheetState();
}

class _BudgetFormSheetState extends ConsumerState<BudgetFormSheet> {
  late final TextEditingController _titleController;
  late final TextEditingController _limitController;
  final _limitFocusNode = FocusNode();
  late String _selectedCategory;
  late int _periodStartDay;
  late int _alertThresholdPercent;

  late String _initialTitle;
  late final String _initialLimit;
  late final String _initialCategory;
  late final int _initialAlertThreshold;

  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _selectedCategory = existing?.category ?? _allCategories;
    _initialCategory = _selectedCategory;
    _initialTitle =
        (existing?.title ??
                (_selectedCategory == _allCategories ? '' : _selectedCategory))
            .trim();
    _initialLimit = existing != null
        ? existing.monthlyLimit.toStringAsFixed(0)
        : '';
    _titleController = TextEditingController(text: _initialTitle)
      ..addListener(_onChanged);
    _limitController = TextEditingController(text: _initialLimit)
      ..addListener(_onChanged);
    _periodStartDay = existing?.periodStartDay ?? 1;
    _alertThresholdPercent = existing?.alertThresholdPercent ?? 80;
    _initialAlertThreshold = _alertThresholdPercent;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Localizations are out of reach in initState.
    if (widget.existing == null && _titleController.text.isEmpty) {
      final defaultTitle = AppLocalizations.of(context).monOverallBudget;
      _titleController.text = defaultTitle;
      _initialTitle = defaultTitle;
    }
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  bool get _isDirty =>
      _titleController.text.trim() != _initialTitle ||
      _limitController.text.trim() != _initialLimit ||
      _selectedCategory != _initialCategory ||
      _alertThresholdPercent != _initialAlertThreshold;

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
    _limitController
      ..removeListener(_onChanged)
      ..dispose();
    _limitFocusNode.dispose();
    super.dispose();
  }

  void _onCategoryChanged(String value) {
    setState(() {
      _selectedCategory = value;
      // Auto-update title if user hasn't typed a custom title
      if (_titleController.text.trim().isEmpty ||
          _titleController.text.trim() ==
              AppLocalizations.of(context).monOverallBudget ||
          categoriesForType('expense').contains(_titleController.text.trim())) {
        _titleController.text = value == _allCategories
            ? AppLocalizations.of(context).monOverallBudget
            : value;
      }
    });
  }

  Future<void> _submit() async {
    final rawLimit = _limitController.text.trim();
    final limit = parseAmount(rawLimit)?.toDouble();
    if (limit == null || limit <= 0) {
      setState(
        () => _error = AppLocalizations.of(context).monEnterTheMonthlyAmount,
      );
      return;
    }

    final title = _titleController.text.trim().isEmpty
        ? (_selectedCategory == _allCategories
              ? AppLocalizations.of(context).monOverallBudget
              : _selectedCategory)
        : _titleController.text.trim();

    final categoryArg = _selectedCategory == _allCategories
        ? null
        : _selectedCategory;

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
          _error = AppLocalizations.of(context).monWeCouldnTSaveIt;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final expenseCategories = categoriesForType('expense');
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
        focusNodes: [_limitFocusNode],
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
                      isEditing
                          ? l10n.monEditTheBudget
                          : l10n.monNewMonthlyBudget,
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
              // Category selector dropdown
              Text(
                l10n.monCategory,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              DropdownButtonFormField<String>(
                initialValue: _selectedCategory,
                isExpanded: true,
                dropdownColor: colors.surface,
                decoration: const InputDecoration(),
                icon: Icon(
                  Icons.arrow_drop_down_rounded,
                  color: colors.mutedForeground,
                ),
                items: [
                  DropdownMenuItem(
                    value: _allCategories,
                    child: Text(
                      l10n.monOverallBudgetAllSpending,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  ...expenseCategories.map(
                    (cat) => DropdownMenuItem(
                      value: cat,
                      child: Row(
                        children: [
                          Icon(
                            categoryIcon(cat),
                            size: 18,
                            color: colors.accent,
                          ),
                          const SizedBox(width: SmartSpendSpacing.sm),
                          Expanded(
                            child: Text(cat, overflow: TextOverflow.ellipsis),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                onChanged: (val) {
                  if (val != null) _onCategoryChanged(val);
                },
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Title input
              Text(
                l10n.monBudgetName,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              TextField(
                controller: _titleController,
                decoration: InputDecoration(hintText: l10n.monLikeFoodAndDrink),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Monthly limit input
              Text(
                l10n.monMonthlyLimit,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              TextField(
                controller: _limitController,
                focusNode: _limitFocusNode,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                    RegExp(r'^[0-9٠-٩]*\.?[0-9٠-٩]*'),
                  ),
                ],
                decoration: InputDecoration(
                  hintText: '5000',
                  suffixText: MoneyLocale.of(context).symbol,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Alert Threshold chips
              Text(
                l10n.monAlertMeAt,
                style: textTheme.labelMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              Wrap(
                spacing: SmartSpendSpacing.sm,
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
                    ? l10n.monSaving
                    : (isEditing ? l10n.monSaveChanges : l10n.monAddTheBudget),
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
