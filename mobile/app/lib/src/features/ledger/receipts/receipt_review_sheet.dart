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
      builder: (context) => ReceiptReviewSheet(receipt: receipt),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Padding(
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
                  AppLocalizations.of(context).monReviewTheReceipt,
                  style: SmartSpendTypography.style(18, FontWeight.w700),
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
              border: Border.all(color: colors.border),
            ),
            child: Column(
              children: [
                Text(
                  AppLocalizations.of(context).monReceiptTotal,
                  style: SmartSpendTypography.style(
                    12,
                    FontWeight.w400,
                  ).copyWith(color: colors.mutedForeground),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  formatMoney(receipt.amount),
                  style: SmartSpendTypography.style(
                    28,
                    FontWeight.w800,
                  ).copyWith(color: colors.accent),
                ),
                if (receipt.merchant != null &&
                    receipt.merchant!.isNotEmpty) ...[
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    receipt.merchant!,
                    style: SmartSpendTypography.style(14, FontWeight.w600),
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
              border: Border.all(color: colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      AppLocalizations.of(context).monCategory2,
                      style: SmartSpendTypography.style(
                        12,
                        FontWeight.w400,
                      ).copyWith(color: colors.mutedForeground),
                    ),
                    const SizedBox(width: SmartSpendSpacing.xs),
                    Text(
                      receipt.subCategory != null &&
                              receipt.subCategory!.isNotEmpty &&
                              receipt.subCategory != 'عام'
                          ? '${receipt.category} / ${receipt.subCategory}'
                          : receipt.category,
                      style: SmartSpendTypography.style(14, FontWeight.w600),
                    ),
                  ],
                ),
                if (receipt.description.isNotEmpty) ...[
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    AppLocalizations.of(context)
                        .monDetailsP0(receipt.description),
                    style: SmartSpendTypography.style(
                      12,
                      FontWeight.w400,
                    ).copyWith(color: colors.foreground),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: AppLocalizations.of(context).monSave,
            variant: ButtonVariant.primary,
            onPressed: () =>
                Navigator.of(context).pop(ReceiptReviewAction.save),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          SmartSpendButton(
            label: AppLocalizations.of(context).monEditInTheBox,
            variant: ButtonVariant.quiet,
            onPressed: () =>
                Navigator.of(context).pop(ReceiptReviewAction.editInComposer),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          SmartSpendButton(
            label: AppLocalizations.of(context).monCancel,
            variant: ButtonVariant.quiet,
            onPressed: () =>
                Navigator.of(context).pop(ReceiptReviewAction.discard),
          ),
        ],
      ),
    );
  }
}
