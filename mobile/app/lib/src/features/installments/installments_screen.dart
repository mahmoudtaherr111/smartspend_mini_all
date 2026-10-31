import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'installment_form_sheet.dart';
import 'installment_models.dart';
import 'installments_providers.dart';

/// Screen managing installment plans («الأقساط»).
class InstallmentsScreen extends ConsumerWidget {
  const InstallmentsScreen({super.key});

  static const path = '/more/installments';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final plansAsync = ref.watch(installmentsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('الأقساط'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: 'إضافة قسط',
            onPressed: () => InstallmentFormSheet.show(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(installmentsProvider.notifier).refresh(),
        child: plansAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(SmartSpendSpacing.screen),
              child: ErrorState(
                message: 'مش قادرين نحمّل الأقساط دلوقتي: $err',
                retryLabel: 'إعادة المحاولة',
                onRetry: () =>
                    ref.read(installmentsProvider.notifier).refresh(),
              ),
            ),
          ),
          data: (plans) {
            if (plans.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                children: [
                  const SizedBox(height: SmartSpendSpacing.xxl),
                  Center(
                    child: EmptyState(
                      icon: Icons.calendar_month_outlined,
                      title: 'مافيش أقساط متسجلة',
                      message: 'عندك قسط؟ ضيفه هنا وكل ما تسجل «دفعت قسط فاليو 800» هنحسبه تلقائياً ونقولك باقي كام.',
                      actionLabel: 'إضافة أول قسط',
                      onAction: () => InstallmentFormSheet.show(context),
                    ),
                  ),
                ],
              );
            }

            final activePlans = plans.where((p) => !p.done).toList();
            final completedPlans = plans.where((p) => p.done).toList();

            final totalMonthly = activePlans.fold<double>(
              0.0,
              (sum, p) => sum + p.monthlyAmount,
            );
            final totalRemaining = activePlans.fold<double>(
              0.0,
              (sum, p) => sum + p.remainingAmount,
            );

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(SmartSpendSpacing.screen),
              children: [
                HeroFigure(
                  label: 'إجمالي الأقساط الشهرية',
                  amount: totalMonthly,
                  kind: AmountKind.expense,
                  story: activePlans.isNotEmpty
                      ? 'عندك ${activePlans.length} أقساط نشطة · إجمالي اللي باقي منها ${formatMoney(totalRemaining)}'
                      : 'خلّصت كل الأقساط المسجلة! مفيش التزامات نشطة حالياً 🎉',
                  wash: true,
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                if (activePlans.isNotEmpty) ...[
                  Text(
                    'الأقساط النشطة (${activePlans.length})',
                    style: SmartSpendTypography.style(
                      16,
                      FontWeight.w700,
                    ).copyWith(color: colors.foreground),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  ...activePlans.map((plan) => _InstallmentCard(plan: plan)),
                ],
                if (completedPlans.isNotEmpty) ...[
                  const SizedBox(height: SmartSpendSpacing.xl),
                  Text(
                    'الأقساط المكتملة (${completedPlans.length})',
                    style: SmartSpendTypography.style(
                      16,
                      FontWeight.w700,
                    ).copyWith(color: colors.foreground),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  ...completedPlans.map((plan) => _InstallmentCard(plan: plan)),
                ],
                const SizedBox(height: SmartSpendSpacing.xxl),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InstallmentCard extends ConsumerWidget {
  const _InstallmentCard({required this.plan});

  final InstallmentPlan plan;

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('مسح القسط'),
        content: Text(
          'متأكد إنك عايز تمسح قسط «${plan.title}»؟ مش هتقدر ترجعه بعد المسح.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(ctx).colorScheme.error,
            ),
            child: const Text('مسح'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final ok = await ref
          .read(installmentsProvider.notifier)
          .deletePlan(plan.id);
      if (context.mounted && !ok) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ماعرفناش نمسح القسط، جرب تاني')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;

    return Container(
      margin: const EdgeInsets.only(bottom: SmartSpendSpacing.md),
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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.title,
                      style: SmartSpendTypography.style(
                        16,
                        FontWeight.w700,
                      ).copyWith(color: colors.foreground),
                    ),
                    if (plan.keyword.isNotEmpty &&
                        plan.keyword != plan.title) ...[
                      const SizedBox(height: 2),
                      Text(
                        'كلمة التتبع: «${plan.keyword}»',
                        style: SmartSpendTypography.style(
                          12,
                          FontWeight.w400,
                        ).copyWith(color: colors.mutedForeground),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: colors.accent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${formatMoney(plan.monthlyAmount)} / شهر',
                  style: SmartSpendTypography.style(
                    13,
                    FontWeight.w700,
                  ).copyWith(color: colors.accent),
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.xs),
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded, size: 20),
                color: colors.mutedForeground,
                tooltip: 'مسح القسط',
                onPressed: () => _confirmDelete(context, ref),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: plan.progressFraction,
              backgroundColor: colors.surfaceRaised,
              valueColor: AlwaysStoppedAnimation<Color>(
                plan.done
                    ? colors.accent
                    : (plan.isAmbiguous ? colors.warning : colors.accent),
              ),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                plan.done
                    ? 'خلّصت كل الأقساط (${plan.totalInstallments} من ${plan.totalInstallments})'
                    : 'مدفوع ${plan.paid} من ${plan.totalInstallments} قسط',
                style: SmartSpendTypography.style(
                  13,
                  FontWeight.w500,
                ).copyWith(color: colors.foreground),
              ),
              if (!plan.done)
                Text(
                  'باقي ${formatMoney(plan.remainingAmount)}',
                  style: SmartSpendTypography.style(
                    13,
                    FontWeight.w600,
                  ).copyWith(color: colors.mutedForeground),
                ),
            ],
          ),
          if (plan.isAmbiguous) ...[
            const SizedBox(height: SmartSpendSpacing.sm),
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.sm),
              decoration: BoxDecoration(
                color: colors.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
              ),
              child: Text(
                'الدفعات باسم متشابه مع خطة تانية. اربطها بمواعيد القسط عشان تعرف الباقي بدقة.',
                style: SmartSpendTypography.style(
                  12,
                  FontWeight.w500,
                ).copyWith(color: colors.warning),
              ),
            ),
          ] else if (plan.done) ...[
            const SizedBox(height: SmartSpendSpacing.sm),
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.sm),
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
              ),
              child: Text(
                'خلّصت الأقساط كلها 🎉 تم سداد إجمالي ${formatMoney(plan.monthlyAmount * plan.totalInstallments)}',
                style: SmartSpendTypography.style(
                  12,
                  FontWeight.w600,
                ).copyWith(color: colors.accent),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
