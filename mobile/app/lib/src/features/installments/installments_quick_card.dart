import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'installment_form_sheet.dart';
import 'installments_providers.dart';
import 'installments_screen.dart';

/// Quick card shown on the Record tab to review active installments or add one (REC-18).
class InstallmentsQuickCard extends ConsumerWidget {
  const InstallmentsQuickCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final plansAsync = ref.watch(installmentsProvider);

    return plansAsync.maybeWhen(
      data: (plans) {
        final activePlans = plans.where((p) => !p.done).toList();
        if (activePlans.isEmpty) {
          // If no active plans, show a compact prompt chip/row
          return Padding(
            padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
            child: InkWell(
              borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              onTap: () => context.push(InstallmentsScreen.path),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.md,
                  vertical: SmartSpendSpacing.sm,
                ),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  border: Border.all(color: colors.border),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.calendar_month_outlined,
                      size: 20,
                      color: colors.accent,
                    ),
                    const SizedBox(width: SmartSpendSpacing.sm),
                    Expanded(
                      child: Text(
                        'عندك أقساط شهرية؟ تابعها من هنا',
                        style: SmartSpendTypography.style(
                          13,
                          FontWeight.w500,
                        ).copyWith(color: colors.foreground),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_rounded, size: 20),
                      tooltip: 'إضافة قسط',
                      onPressed: () => InstallmentFormSheet.show(context),
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        final totalMonthly = activePlans.fold<double>(
          0.0,
          (sum, p) => sum + p.monthlyAmount,
        );

        return Padding(
          padding: const EdgeInsets.only(bottom: SmartSpendSpacing.md),
          child: InkWell(
            borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
            onTap: () => context.push(InstallmentsScreen.path),
            child: Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.md),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.calendar_month_rounded,
                        size: 22,
                        color: colors.accent,
                      ),
                      const SizedBox(width: SmartSpendSpacing.sm),
                      Expanded(
                        child: Text(
                          'الأقساط (${activePlans.length})',
                          style: SmartSpendTypography.style(
                            14,
                            FontWeight.w700,
                          ).copyWith(color: colors.foreground),
                        ),
                      ),
                      Text(
                        '${formatMoney(totalMonthly)} / شهر',
                        style: SmartSpendTypography.style(
                          13,
                          FontWeight.w700,
                        ).copyWith(color: colors.accent),
                      ),
                      const SizedBox(width: SmartSpendSpacing.xs),
                      const Icon(
                        Icons.chevron_left_rounded,
                        size: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    '${activePlans.first.title}: فاضل ${activePlans.first.remaining} من أصل ${activePlans.first.totalInstallments} قسط',
                    style: SmartSpendTypography.style(
                      12,
                      FontWeight.w400,
                    ).copyWith(color: colors.mutedForeground),
                  ),
                ],
              ),
            ),
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
