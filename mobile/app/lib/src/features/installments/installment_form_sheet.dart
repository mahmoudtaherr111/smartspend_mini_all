import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

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
    final amount = (parseAmount(_amountController.text.trim()) ?? 0.0)
        .toDouble();
    final total = (parseAmount(_totalController.text.trim()) ?? 0).toInt();
    final paidBefore = (parseAmount(_paidBeforeController.text.trim()) ?? 0)
        .toInt();

    if (title.length < 2) {
      setState(
        () => _error = AppLocalizations.of(context).appEnterANameAtLeast,
      );
      return;
    }
    if (amount <= 0) {
      setState(
        () => _error = AppLocalizations.of(context).appEnterTheMonthlyAmount,
      );
      return;
    }
    if (total < 1) {
      setState(
        () =>
            _error = AppLocalizations.of(context)
                .appEnterTheNumberOfInstallments,
      );
      return;
    }
    if (paidBefore < 0 || paidBefore > total) {
      setState(
        () =>
            _error = AppLocalizations.of(context)
                .appPaidInstallmentsMustBeBetween,
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
          _error = AppLocalizations.of(context).appWeCouldnTAddIt;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = AppLocalizations.of(context).appSomethingWentWrongTryAgain;
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
                    AppLocalizations.of(context).appNewInstallment,
                    style: Theme.of(context).textTheme.headlineSmall!
                        .copyWith(color: colors.foreground),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: AppLocalizations.of(context).appClose,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Text(
              AppLocalizations.of(context).appWheneverYouRecordSpendingWith,
              style: Theme.of(context).textTheme.bodyMedium!
                  .copyWith(color: colors.mutedForeground),
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
                  style: Theme.of(context).textTheme.bodyMedium!
                      .copyWith(color: colors.danger),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
            ],
            TextField(
              controller: _titleController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context).appName,
                hintText: AppLocalizations.of(context).appLikeValuPhoneOrThe,
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _keywordController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context).appPaymentWordOptional,
                hintText: AppLocalizations.of(context).appLikeValuEmptyUsesThe,
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _amountController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context).appMonthlyAmount,
                hintText: AppLocalizations.of(context).appLike850,
                suffixText: MoneyLocale.of(context).symbol,
              ),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(
                  RegExp(r'^[0-9٠-٩]*\.?[0-9٠-٩]*'),
                ),
              ],
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _totalController,
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context)
                          .appTotalInstallments,
                      hintText: AppLocalizations.of(context).appLike12,
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'^[0-9٠-٩]*')),
                    ],
                    textInputAction: TextInputAction.next,
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: TextField(
                    controller: _paidBeforeController,
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context).appAlreadyPaid,
                      hintText: '0',
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'^[0-9٠-٩]*')),
                    ],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: AppLocalizations.of(context).appSave,
              busy: _submitting,
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
