import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../wallets/wallet_providers.dart';
import 'category_style.dart';
import 'offline/outbox.dart';

/// Opens the sheet that records a transaction by hand (REC-12).
/// Returns true when the entry was saved or queued offline.
Future<bool> showManualRecordSheet(BuildContext context) async {
  final saved = await showSmartSpendSheet<bool>(
    context: context,
    builder: (_) => const MoneyPrivacy(
      hidden: false,
      child: ManualRecordSheet(),
    ),
  );
  return saved ?? false;
}

/// The manual record sheet: custom Egyptian keypad, type switch, category picker, date and wallet (REC-12).
class ManualRecordSheet extends ConsumerStatefulWidget {
  const ManualRecordSheet({super.key});

  @override
  ConsumerState<ManualRecordSheet> createState() => _ManualRecordSheetState();
}

class _ManualRecordSheetState extends ConsumerState<ManualRecordSheet> {
  String _type = 'expense'; // 'expense', 'income', 'transfer'
  String _amountBuffer = '';
  late String _category;
  String? _subCategory;
  late DateTime _date;
  int? _walletId;
  final TextEditingController _noteController = TextEditingController();
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _category = 'أكل وشرب';
    _subCategory = 'عام';
    _date = clock.now();
    _noteController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  bool get _isDirty =>
      _amountBuffer.isNotEmpty ||
      _noteController.text.trim().isNotEmpty ||
      _walletId != null;

  void _onDigit(String digit) {
    if (_saving) return;
    unawaited(SmartSpendHaptics.selection());
    setState(() {
      _error = null;
      if (_amountBuffer.contains('.') &&
          _amountBuffer.split('.')[1].length >= 2) {
        return; // Max 2 decimal digits
      }
      if (_amountBuffer == '0' && digit != '0') {
        _amountBuffer = digit;
      } else if (_amountBuffer.length < 9) {
        _amountBuffer += digit;
      }
    });
  }

  void _onDecimal() {
    if (_saving) return;
    unawaited(SmartSpendHaptics.selection());
    setState(() {
      _error = null;
      if (_amountBuffer.isEmpty) {
        _amountBuffer = '0.';
      } else if (!_amountBuffer.contains('.')) {
        _amountBuffer += '.';
      }
    });
  }

  void _onDelete() {
    if (_saving || _amountBuffer.isEmpty) return;
    unawaited(SmartSpendHaptics.selection());
    setState(() {
      _error = null;
      _amountBuffer = _amountBuffer.substring(0, _amountBuffer.length - 1);
    });
  }

  void _onClear() {
    if (_saving || _amountBuffer.isEmpty) return;
    unawaited(SmartSpendHaptics.warning());
    setState(() {
      _error = null;
      _amountBuffer = '';
    });
  }

  void _setType(String newType) {
    if (_type == newType || _saving) return;
    unawaited(SmartSpendHaptics.selection());
    setState(() {
      _type = newType;
      // Set canonical default category for the type
      if (newType == 'income') {
        _category = 'مرتب';
        _subCategory = 'عام';
      } else if (newType == 'transfer') {
        _category = 'تحويل';
        _subCategory = 'عام';
      } else {
        _category = 'أكل وشرب';
        _subCategory = 'عام';
      }
    });
  }

  Future<void> _pickCategory() async {
    if (_saving) return;
    final available = categoryTaxonomy
        .where((tax) => tax.type == _type || (_type == 'expense' && tax.type == 'expense'))
        .toList();
    if (available.isEmpty) return;

    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.smartSpendColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(SmartSpendRadii.sheet)),
      ),
      builder: (ctx) => _CategoryPickerSheet(
        categories: available,
        selected: _category,
      ),
    );

    if (picked != null && mounted) {
      unawaited(SmartSpendHaptics.selection());
      setState(() {
        _category = picked;
        _subCategory = defaultSubCategory(picked);
      });
    }
  }

  Future<void> _pickDate() async {
    if (_saving) return;
    final now = clock.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(now.year - 2, 1, 1),
      lastDate: DateTime(now.year + 1, 12, 31),
    );
    if (picked != null && mounted) {
      unawaited(SmartSpendHaptics.selection());
      setState(() {
        _date = picked;
      });
    }
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final amount = parseAmount(_amountBuffer);
    if (amount == null || amount <= 0) {
      unawaited(SmartSpendHaptics.warning());
      setState(() => _error = l10n.manualRecordAmountRequired);
      return;
    }
    if (_category.trim().isEmpty) {
      unawaited(SmartSpendHaptics.warning());
      setState(() => _error = l10n.manualRecordCategoryRequired);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final outbox = ref.read(outboxProvider.notifier);
      final outcome = await outbox.submitManual(
        amount: amount.toDouble(),
        type: _type,
        category: _category,
        subCategory: _subCategory,
        description: _noteController.text.trim().isNotEmpty
            ? _noteController.text.trim()
            : null,
        date: _date,
        walletId: _walletId,
      );

      if (!mounted) return;

      switch (outcome) {
        case SubmitSaved():
          unawaited(SmartSpendHaptics.success());
          Navigator.of(context).pop(true);
          showSmartSpendNotice(context, l10n.manualRecordSavedNotice);
        case SubmitQueued():
          unawaited(SmartSpendHaptics.success());
          Navigator.of(context).pop(true);
          showSmartSpendNotice(context, l10n.manualRecordQueuedNotice);
        case SubmitFailed(:final message):
          unawaited(SmartSpendHaptics.warning());
          setState(() {
            _saving = false;
            _error = message;
          });
        default:
          unawaited(SmartSpendHaptics.success());
          Navigator.of(context).pop(true);
          showSmartSpendNotice(context, l10n.manualRecordSavedNotice);
      }
    } catch (e) {
      if (mounted) {
        unawaited(SmartSpendHaptics.warning());
        setState(() {
          _saving = false;
          _error = e.toString();
        });
      }
    }
  }

  Future<bool> _confirmDiscard() async {
    final l10n = AppLocalizations.of(context);
    final discard = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.discardChangesTitle),
        content: Text(l10n.discardChangesBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.discardChangesCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.discardChangesConfirm),
          ),
        ],
      ),
    );
    return discard ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final walletsAsync = ref.watch(walletsProvider);

    return PopScope(
      canPop: !_isDirty || _saving,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldDiscard = await _confirmDiscard();
        if (shouldDiscard && context.mounted) {
          Navigator.of(context).pop(false);
        }
      },
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.92,
        ),
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Sheet handle
              Center(
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: colors.mutedForeground.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Header title & close button
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.manualRecordTitle,
                        style: SmartSpendTypography.style(20, FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () async {
                        if (!_isDirty || await _confirmDiscard()) {
                          if (context.mounted) Navigator.of(context).pop(false);
                        }
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: SmartSpendSpacing.xs),

              // Type Toggle (Expense / Income / Transfer)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  ),
                  child: Row(
                    children: [
                      _TypeTab(
                        label: l10n.manualRecordTypeExpense,
                        icon: Icons.arrow_upward_rounded,
                        selected: _type == 'expense',
                        color: colors.danger,
                        onTap: () => _setType('expense'),
                      ),
                      _TypeTab(
                        label: l10n.manualRecordTypeIncome,
                        icon: Icons.arrow_downward_rounded,
                        selected: _type == 'income',
                        color: colors.accent,
                        onTap: () => _setType('income'),
                      ),
                      _TypeTab(
                        label: l10n.manualRecordTypeTransfer,
                        icon: Icons.swap_horiz_rounded,
                        selected: _type == 'transfer',
                        color: colors.info,
                        onTap: () => _setType('transfer'),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: SmartSpendSpacing.md),

              // Hero Amount Display
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
                child: Center(
                  child: Text(
                    _amountBuffer.isEmpty
                        ? '${l10n.manualRecordAmountHint} ${MoneyLocale.of(context).symbol}'
                        : '$_amountBuffer ${MoneyLocale.of(context).symbol}',
                    style: SmartSpendTypography.style(
                      38,
                      FontWeight.w800,
                    ).copyWith(
                      color: _amountBuffer.isEmpty
                          ? colors.mutedForeground.withValues(alpha: 0.4)
                          : _type == 'income'
                              ? colors.accent
                              : colors.foreground,
                    ),
                  ),
                ),
              ),

              if (_error != null) ...[
              const SizedBox(height: SmartSpendSpacing.xs),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: SmartSpendTypography.style(
                    14,
                    FontWeight.w600,
                  ).copyWith(color: colors.danger),
                ),
              ),
            ],

            const SizedBox(height: SmartSpendSpacing.sm),

            // Details Row: Category Chip & Date Chip & Wallet Chip
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    // Category Chip
                    ActionChip(
                      avatar: Icon(
                        categoryIcon(_category),
                        size: 18,
                        color: categoryColor(context, _category),
                      ),
                      label: Text(_category),
                      onPressed: _pickCategory,
                      backgroundColor: colors.surface,
                      side: BorderSide(
                        color: colors.border,
                      ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.sm),

                    // Date Chip
                    ActionChip(
                      avatar: const Icon(Icons.calendar_today_rounded, size: 16),
                      label: Text(
                        DateWords.of(context).day(_date, now: clock.now()),
                      ),
                      onPressed: _pickDate,
                      backgroundColor: colors.surface,
                      side: BorderSide(
                        color: colors.border,
                      ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.sm),

                    // Wallet Dropdown / Chip
                    walletsAsync.maybeWhen(
                      data: (wallets) => wallets.isEmpty
                          ? const SizedBox.shrink()
                          : DropdownButtonHideUnderline(
                              child: DropdownButton<int?>(
                                value: _walletId,
                                hint: Text(
                                  l10n.manualRecordNoWallet,
                                  style: SmartSpendTypography.style(13, FontWeight.w500),
                                ),
                                icon: const Icon(Icons.account_balance_wallet_outlined, size: 16),
                                items: [
                                  DropdownMenuItem<int?>(
                                    value: null,
                                    child: Text(l10n.manualRecordNoWallet),
                                  ),
                                  for (final w in wallets)
                                    DropdownMenuItem<int?>(
                                      value: w.id,
                                      child: Text(w.name),
                                    ),
                                ],
                                onChanged: (id) => setState(() => _walletId = id),
                              ),
                            ),
                      orElse: () => const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: SmartSpendSpacing.xs),

            // Optional Note Field
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
              child: TextField(
                controller: _noteController,
                maxLines: 1,
                decoration: InputDecoration(
                  hintText: l10n.manualRecordNoteHint,
                  isDense: true,
                  prefixIcon: const Icon(Icons.edit_note_rounded, size: 20),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: SmartSpendSpacing.sm,
                    vertical: SmartSpendSpacing.xs,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  ),
                ),
              ),
            ),

            const SizedBox(height: SmartSpendSpacing.sm),

            // Custom Egyptian Numeric Keypad
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
              child: _EgyptianNumericKeypad(
                onDigit: _onDigit,
                onDecimal: _onDecimal,
                onDelete: _onDelete,
                onClear: _onClear,
                deleteLabel: 'مسح',
              ),
            ),

            const SizedBox(height: SmartSpendSpacing.sm),

            // Save CTA Button
            Padding(
              padding: const EdgeInsets.fromLTRB(
                SmartSpendSpacing.lg,
                0,
                SmartSpendSpacing.lg,
                SmartSpendSpacing.md,
              ),
              child: SmartSpendButton(
                label: l10n.manualRecordSave,
                onPressed: _saving ? null : _save,
                busy: _saving,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
}

class _TypeTab extends StatelessWidget {
  const _TypeTab({
    required this.label,
    required this.icon,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: selected ? colors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 16,
                color: selected ? color : colors.mutedForeground,
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: SmartSpendTypography.style(
                  13,
                  selected ? FontWeight.w700 : FontWeight.w500,
                ).copyWith(
                  color: selected ? colors.foreground : colors.mutedForeground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EgyptianNumericKeypad extends StatelessWidget {
  const _EgyptianNumericKeypad({
    required this.onDigit,
    required this.onDecimal,
    required this.onDelete,
    required this.onClear,
    required this.deleteLabel,
  });

  final ValueChanged<String> onDigit;
  final VoidCallback onDecimal;
  final VoidCallback onDelete;
  final VoidCallback onClear;
  final String deleteLabel;

  static const _keys = [
    ('1', '١'),
    ('2', '٢'),
    ('3', '٣'),
    ('4', '٤'),
    ('5', '٥'),
    ('6', '٦'),
    ('7', '٧'),
    ('8', '٨'),
    ('9', '٩'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var row = 0; row < 3; row++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                for (var col = 0; col < 3; col++) ...[
                  if (col > 0) const SizedBox(width: 8),
                  Expanded(
                    child: _KeypadButton(
                      westernDigit: _keys[row * 3 + col].$1,
                      easternDigit: _keys[row * 3 + col].$2,
                      onTap: () => onDigit(_keys[row * 3 + col].$1),
                    ),
                  ),
                ],
              ],
            ),
          ),
        Row(
          children: [
            Expanded(
              child: _ActionKeyButton(
                label: '.',
                onTap: onDecimal,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _KeypadButton(
                westernDigit: '0',
                easternDigit: '٠',
                onTap: () => onDigit('0'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _DeleteKeyButton(
                onTap: onDelete,
                onLongPress: onClear,
                semanticsLabel: deleteLabel,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _KeypadButton extends StatelessWidget {
  const _KeypadButton({
    required this.westernDigit,
    required this.easternDigit,
    required this.onTap,
  });

  final String westernDigit;
  final String easternDigit;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        child: Container(
          height: 48,
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                westernDigit,
                style: SmartSpendTypography.style(20, FontWeight.w700),
              ),
              const SizedBox(width: 4),
              Text(
                easternDigit,
                style: SmartSpendTypography.style(
                  13,
                  FontWeight.w500,
                ).copyWith(color: colors.mutedForeground),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionKeyButton extends StatelessWidget {
  const _ActionKeyButton({
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Material(
      color: colors.surfaceRaised.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        child: Container(
          height: 48,
          alignment: Alignment.center,
          child: Text(
            label,
            style: SmartSpendTypography.style(22, FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

class _DeleteKeyButton extends StatelessWidget {
  const _DeleteKeyButton({
    required this.onTap,
    required this.onLongPress,
    required this.semanticsLabel,
  });

  final VoidCallback onTap;
  final VoidCallback onLongPress;
  final String semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return Semantics(
      label: semanticsLabel,
      button: true,
      child: Material(
        color: colors.surfaceRaised.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          borderRadius: BorderRadius.circular(SmartSpendRadii.md),
          child: Container(
            height: 48,
            alignment: Alignment.center,
            child: Icon(
              Icons.backspace_outlined,
              size: 20,
              color: colors.foreground,
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryPickerSheet extends StatefulWidget {
  const _CategoryPickerSheet({
    required this.categories,
    required this.selected,
  });

  final List<CategoryTaxonomy> categories;
  final String selected;

  @override
  State<_CategoryPickerSheet> createState() => _CategoryPickerSheetState();
}

class _CategoryPickerSheetState extends State<_CategoryPickerSheet> {
  final _searchController = TextEditingController();
  String _filter = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final l10n = AppLocalizations.of(context);
    final filtered = widget.categories
        .where((cat) =>
            cat.name.contains(_filter) ||
            cat.subcategories.any((sub) => sub.contains(_filter)))
        .toList();

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.7,
      ),
      padding: const EdgeInsets.all(SmartSpendSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.manualRecordSelectCategory,
                  style: SmartSpendTypography.style(18, FontWeight.w700),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          TextField(
            controller: _searchController,
            onChanged: (val) => setState(() => _filter = val.trim()),
            decoration: InputDecoration(
              hintText: l10n.searchHint,
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          Expanded(
            child: ListView.separated(
              itemCount: filtered.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (ctx, index) {
                final cat = filtered[index];
                final isSelected = cat.name == widget.selected;
                return ListTile(
                  leading: CategoryTile(
                    category: cat.name,
                    size: 38,
                  ),
                  title: Text(
                    cat.name,
                    style: SmartSpendTypography.style(
                      15,
                      isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  trailing: isSelected
                      ? Icon(Icons.check_rounded, color: colors.accent)
                      : null,
                  onTap: () => Navigator.of(context).pop(cat.name),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
