import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../../l10n/app_localizations.dart';

import 'receipt_models.dart';

enum ReceiptReviewAction { save, editInComposer, discard }

/// Review sheet for inspected receipt before saving.
class ReceiptReviewSheet extends StatelessWidget {
  const ReceiptReviewSheet({super.key, required this.receipt});

  final ReceiptData receipt;

  static Future<ReceiptReviewAction?> show(
    BuildContext context,
    ReceiptData receipt,
  ) {
    return showSmartSpendSheet<ReceiptReviewAction>(
      context: context,
      scrollable: true,
      builder: (context) => MoneyPrivacy(
        hidden: false,
        child: ReceiptReviewSheet(receipt: receipt),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return MoneyPrivacy(
      hidden: false,
      child: Builder(
        builder: (unmaskedContext) => Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: SmartSpendSpacing.lg,
            vertical: SmartSpendSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.receipt_long_rounded, color: colors.accent),
                  const SizedBox(width: SmartSpendSpacing.sm),
                  Expanded(
                    child: Text(
                      AppLocalizations.of(unmaskedContext).monReviewTheReceipt,
                      style: Theme.of(unmaskedContext).textTheme.titleLarge!,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Amount hero card
              Container(
                padding: const EdgeInsets.all(SmartSpendSpacing.md),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
                ),
                child: Column(
                  children: [
                    Text(
                      AppLocalizations.of(unmaskedContext).monReceiptTotal,
                      style: Theme.of(unmaskedContext).textTheme.bodySmall!
                          .copyWith(color: colors.mutedForeground),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xs),
                    Text(
                      moneyText(unmaskedContext, receipt.amount),
                      style: Theme.of(unmaskedContext).textTheme.displaySmall!
                          .copyWith(color: colors.accent),
                    ),
                    if (receipt.merchant != null &&
                        receipt.merchant!.isNotEmpty) ...[
                      const SizedBox(height: SmartSpendSpacing.xs),
                      Text(
                        receipt.merchant!,
                        style: Theme.of(unmaskedContext).textTheme.titleSmall!,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              // Details
              Container(
                padding: const EdgeInsets.all(SmartSpendSpacing.sm),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          AppLocalizations.of(unmaskedContext).monCategory2,
                          style: Theme.of(unmaskedContext).textTheme.bodySmall!
                              .copyWith(color: colors.mutedForeground),
                        ),
                        const SizedBox(width: SmartSpendSpacing.xs),
                        Expanded(
                          child: Text(
                            receipt.subCategory != null &&
                                    receipt.subCategory!.isNotEmpty &&
                                    receipt.subCategory != 'عام'
                                ? '${receipt.category} / ${receipt.subCategory}'
                                : receipt.category,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(unmaskedContext)
                                .textTheme
                                .titleSmall!,
                          ),
                        ),
                      ],
                    ),
                    if (receipt.description.isNotEmpty) ...[
                      const SizedBox(height: SmartSpendSpacing.xs),
                      Text(
                        AppLocalizations.of(unmaskedContext)
                            .monDetailsP0(receipt.description),
                        style: Theme.of(unmaskedContext).textTheme.bodySmall!
                            .copyWith(color: colors.foreground),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.lg),
              SmartSpendButton(
                label: AppLocalizations.of(unmaskedContext).monSave,
                variant: ButtonVariant.primary,
                onPressed: () =>
                    Navigator.of(unmaskedContext).pop(ReceiptReviewAction.save),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              SmartSpendButton(
                label: AppLocalizations.of(unmaskedContext).monEditInTheBox,
                variant: ButtonVariant.quiet,
                onPressed: () =>
                    Navigator.of(unmaskedContext)
                        .pop(ReceiptReviewAction.editInComposer),
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              SmartSpendButton(
                label: AppLocalizations.of(unmaskedContext).monCancel,
                variant: ButtonVariant.quiet,
                onPressed: () =>
                    Navigator.of(unmaskedContext)
                        .pop(ReceiptReviewAction.discard),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
