import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../wallets/wallet_models.dart';
import '../wallets/wallet_providers.dart';
import 'category_style.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';

/// Opens the sheet that edits [entry] (REC-07 in .agents/mobile-program/features.json). Returns true when changes
/// were saved on the server.
Future<bool> showEditTransactionSheet(
  BuildContext context, {
  required LedgerEntry entry,
}) async {
  final saved = await showSmartSpendSheet<bool>(
    context: context,
    // The person opened the sheet to edit the amount: numbers show even while privacy mode hides amounts elsewhere.
    builder: (_) =>
        MoneyPrivacy(hidden: false, child: _EditTransactionSheet(entry: entry)),
  );
  return saved ?? false;
}

enum _EditKind {
  expense('expense'),
  refund('expense'),
  income('income'),
  transfer('transfer'),
  investment('investment');

  const _EditKind(this.ledgerType);

  final String ledgerType;
}

class _EditTransactionSheet extends ConsumerStatefulWidget {
  const _EditTransactionSheet({required this.entry});

  final LedgerEntry entry;

  @override
  ConsumerState<_EditTransactionSheet> createState() =>
      _EditTransactionSheetState();
}

class _EditTransactionSheetState extends ConsumerState<_EditTransactionSheet> {
  late _EditKind _kind;
  late final TextEditingController _amountController;
  late final TextEditingController _noteController;
  late String _category;
  late String _subCategory;
  late DateTime _date;
  int? _walletId;
  int? _contactId;
  String? _amountError;
  String? _serverError;
  bool _saving = false;
  bool _dateChanged = false;

  @override
  void initState() {
    super.initState();
    final entry = widget.entry;
    _kind = entry.isRefund
        ? _EditKind.refund
        : switch (entry.type) {
            'income' => _EditKind.income,
            'transfer' => _EditKind.transfer,
            'investment' => _EditKind.investment,
            _ => _EditKind.expense,
          };
    final absAmount = entry.amount.abs();
    final initialAmount = absAmount == absAmount.truncateToDouble()
        ? absAmount.toInt().toString()
        : absAmount.toString();
    _amountController = TextEditingController(text: initialAmount);
    _noteController = TextEditingController(text: entry.description ?? '');
    _category = entry.category.trim().isNotEmpty
        ? entry.category.trim()
        : categoriesForType(_kind.ledgerType).first;
    final subs = subcategoriesForCategory(
      _category,
      current: entry.subCategory,
    );
    final initialSub = entry.subCategory?.trim();
    _subCategory = initialSub != null && initialSub.isNotEmpty
        ? initialSub
        : (subs.contains('عام') ? 'عام' : subs.first);
    _date = entry.date;
    _walletId = entry.walletId;
    _contactId = entry.contactId;
  }

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _selectKind(_EditKind next, List<String> customCategories) {
    if (_kind == next) return;
    setState(() {
      final previousType = _kind.ledgerType;
      _kind = next;
      _serverError = null;
      if (previousType != next.ledgerType) {
        final allowed = categoriesForType(
          next.ledgerType,
          custom: customCategories,
        );
        if (!allowed.contains(_category)) {
          _category = allowed.first;
          _subCategory = defaultSubCategory(_category);
        }
      }
    });
  }

  void _selectCategory(String next) {
    if (_category == next) return;
    setState(() {
      _category = next;
      _subCategory = defaultSubCategory(next);
      _serverError = null;
    });
  }

  Future<void> _pickDate() async {
    final now = clock.now();
    final first = DateTime(2020);
    final last = DateTime(now.year + 1, 12, 31);
    final initial = _date.isBefore(first)
        ? first
        : (_date.isAfter(last) ? last : _date);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: last,
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date = DateTime(
        picked.year,
        picked.month,
        picked.day,
        _date.hour,
        _date.minute,
        _date.second,
      );
      _dateChanged = true;
      _serverError = null;
    });
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final parsed = parseAmount(_amountController.text);
    if (parsed == null || parsed <= 0 || parsed > 999999999) {
      unawaited(SmartSpendHaptics.warning());
      setState(() {
        _amountError = l10n.editAmountInvalid;
        _serverError = null;
      });
      return;
    }

    setState(() {
      _saving = true;
      _amountError = null;
      _serverError = null;
    });

    try {
      final dateIso = _dateChanged
          ? DateTime.utc(
              _date.year,
              _date.month,
              _date.day,
              12,
              0,
              0,
            ).toIso8601String()
          : null;
      await ref
          .read(ledgerApiProvider)
          .update(
            id: widget.entry.id,
            amount: parsed,
            type: _kind.ledgerType,
            refund: _kind.ledgerType == 'expense'
                ? _kind == _EditKind.refund
                : null,
            category: _category,
            subCategory: _subCategory,
            description: _noteController.text.trim(),
            date: dateIso,
            walletId: _walletId,
            contactId: _contactId,
          );
      unawaited(SmartSpendHaptics.success());
      refreshLedger(ref);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      unawaited(SmartSpendHaptics.error());
      if (mounted) {
        setState(
          () => _serverError = error.message.isNotEmpty
              ? error.message
              : l10n.editFailed,
        );
      }
    } on ApiNetworkException catch (error) {
      ref.read(networkStatusProvider.notifier).unreachable();
      unawaited(SmartSpendHaptics.error());
      if (mounted) {
        setState(
          () => _serverError = error.message.isNotEmpty
              ? error.message
              : l10n.editFailed,
        );
      }
    } on Object {
      unawaited(SmartSpendHaptics.error());
      if (mounted) setState(() => _serverError = l10n.editFailed);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _kindLabel(AppLocalizations l10n, _EditKind kind) => switch (kind) {
    _EditKind.expense => l10n.transactionKindExpense,
    _EditKind.refund => l10n.transactionKindRefund,
    _EditKind.income => l10n.transactionKindIncome,
    _EditKind.transfer => l10n.transactionKindTransfer,
    _EditKind.investment => l10n.transactionKindInvestment,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final words = DateWords.of(context);
    final online = ref.watch(networkStatusProvider);
    final customCategories =
        ref.watch(customCategoriesProvider).value ?? const <String>[];
    final wallets = ref.watch(walletsProvider).value ?? const <Wallet>[];
    final contacts =
        ref.watch(contactsProvider).value ?? const <ContactSummary>[];

    final categories = categoriesForType(
      _kind.ledgerType,
      current: _category,
      custom: customCategories,
    );
    final subcategories = subcategoriesForCategory(
      _category,
      current: _subCategory,
    );

    final walletItems = <DropdownMenuItem<int?>>[
      DropdownMenuItem<int?>(
        value: null,
        child: Text(l10n.editWalletNone, overflow: TextOverflow.ellipsis),
      ),
      for (final wallet in wallets)
        DropdownMenuItem<int?>(
          value: wallet.id,
          child: Text(inlineName(wallet.name), overflow: TextOverflow.ellipsis),
        ),
      if (_walletId != null && !wallets.any((w) => w.id == _walletId))
        DropdownMenuItem<int?>(
          value: _walletId,
          child: Text(
            l10n.transactionWalletUnknown,
            overflow: TextOverflow.ellipsis,
          ),
        ),
    ];

    final contactItems = <DropdownMenuItem<int?>>[
      DropdownMenuItem<int?>(
        value: null,
        child: Text(l10n.editPersonNone, overflow: TextOverflow.ellipsis),
      ),
      for (final contact in contacts)
        DropdownMenuItem<int?>(
          value: contact.id,
          child: Text(
            inlineName(contact.name),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      if (_contactId != null && !contacts.any((c) => c.id == _contactId))
        DropdownMenuItem<int?>(
          value: _contactId,
          child: Text(
            l10n.transactionPersonUnknown,
            overflow: TextOverflow.ellipsis,
          ),
        ),
    ];

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xl + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.editTransactionTitle, style: textTheme.titleLarge),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            l10n.editTransactionSubtitle,
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          Text(
            l10n.editKindLabel,
            style: textTheme.labelLarge?.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Wrap(
            spacing: SmartSpendSpacing.sm,
            runSpacing: SmartSpendSpacing.xs,
            children: [
              for (final kind in _EditKind.values)
                ChoiceChip(
                  label: Text(_kindLabel(l10n, kind)),
                  selected: _kind == kind,
                  onSelected: _saving
                      ? null
                      : (_) => _selectKind(kind, customCategories),
                ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            controller: _amountController,
            enabled: !_saving,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            onChanged: (_) {
              if (_amountError != null || _serverError != null) {
                setState(() {
                  _amountError = null;
                  _serverError = null;
                });
              }
            },
            decoration: InputDecoration(
              labelText: l10n.editAmountLabel,
              errorText: _amountError,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          DropdownButtonFormField<String>(
            key: ValueKey('category-${_kind.name}-$_category'),
            initialValue: _category,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.editCategoryLabel),
            items: [
              for (final category in categories)
                DropdownMenuItem<String>(
                  value: category,
                  child: Row(
                    children: [
                      Icon(
                        categoryIcon(category),
                        size: 20,
                        color: categoryColor(context, category),
                      ),
                      const SizedBox(width: SmartSpendSpacing.sm),
                      Expanded(
                        child: Text(category, overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                ),
            ],
            onChanged: _saving
                ? null
                : (value) {
                    if (value != null) _selectCategory(value);
                  },
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          DropdownButtonFormField<String>(
            key: ValueKey('sub-$_category-$_subCategory'),
            initialValue: _subCategory,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.editSubCategoryLabel),
            items: [
              for (final sub in subcategories)
                DropdownMenuItem<String>(
                  value: sub,
                  child: Text(sub, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: _saving
                ? null
                : (value) {
                    if (value != null) {
                      setState(() {
                        _subCategory = value;
                        _serverError = null;
                      });
                    }
                  },
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          InkWell(
            onTap: _saving ? null : _pickDate,
            borderRadius: BorderRadius.circular(SmartSpendRadii.md),
            child: InputDecorator(
              decoration: InputDecoration(labelText: l10n.editDateLabel),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${words.day(_date, now: clock.now())} · ${inlineName(words.clock(_date))}',
                      style: textTheme.bodyLarge,
                    ),
                  ),
                  Icon(
                    Icons.calendar_today_rounded,
                    size: 18,
                    color: colors.mutedForeground,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          DropdownButtonFormField<int?>(
            key: ValueKey('wallet-$_walletId-${wallets.length}'),
            initialValue: _walletId,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.editWalletLabel),
            items: walletItems,
            onChanged: _saving
                ? null
                : (value) => setState(() {
                    _walletId = value;
                    _serverError = null;
                  }),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          DropdownButtonFormField<int?>(
            key: ValueKey('contact-$_contactId-${contacts.length}'),
            initialValue: _contactId,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.editPersonLabel),
            items: contactItems,
            onChanged: _saving
                ? null
                : (value) => setState(() {
                    _contactId = value;
                    _serverError = null;
                  }),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            controller: _noteController,
            enabled: !_saving,
            maxLines: 2,
            minLines: 1,
            maxLength: 2000,
            decoration: InputDecoration(labelText: l10n.editNoteLabel),
          ),
          if (!online) ...[
            const SizedBox(height: SmartSpendSpacing.sm),
            InlineMessage(l10n.transactionEditOffline, warning: true),
          ],
          if (_serverError case final String error) ...[
            const SizedBox(height: SmartSpendSpacing.sm),
            InlineMessage(error),
          ],
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: l10n.editSave,
            busy: _saving,
            onPressed: _saving || !online ? null : _save,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: l10n.editCancel,
            variant: ButtonVariant.quiet,
            onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          ),
        ],
      ),
    );
  }
}
