import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

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
        title: Text(AppLocalizations.of(context).appInstallments),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: AppLocalizations.of(context).appAddAnInstallment,
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
                message: AppLocalizations.of(context).appWeCanTLoadYour,
                retryLabel: AppLocalizations.of(context).appTryAgain,
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
                      title: AppLocalizations.of(context).appNoInstallmentsYet,
                      message: AppLocalizations.of(context)
                          .appAddAnInstallmentAndWhenever,
                      actionLabel: AppLocalizations.of(context)
                          .appAddYourFirstInstallment,
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
                  label: AppLocalizations.of(context)
                      .appTotalMonthlyInstallments,
                  amount: totalMonthly,
                  kind: AmountKind.expense,
                  story: activePlans.isNotEmpty
                      ? AppLocalizations.of(context)
                            .appP0ActiveInstallmentsP1Left(
                              '${activePlans.length}',
                              moneyText(context, totalRemaining),
                            )
                      : AppLocalizations.of(context)
                            .appAllYourInstallmentsAreFinished,
                  wash: true,
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                if (activePlans.isNotEmpty) ...[
                  Text(
                    AppLocalizations.of(context)
                        .appActiveInstallmentsP0('${activePlans.length}'),
                    style: Theme.of(context).textTheme.titleMedium!
                        .copyWith(color: colors.foreground),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  ...activePlans.map((plan) => _InstallmentCard(plan: plan)),
                ],
                if (completedPlans.isNotEmpty) ...[
                  const SizedBox(height: SmartSpendSpacing.xl),
                  Text(
                    AppLocalizations.of(context)
                        .appFinishedInstallmentsP0('${completedPlans.length}'),
                    style: Theme.of(context).textTheme.titleMedium!
                        .copyWith(color: colors.foreground),
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
        title: Text(AppLocalizations.of(context).appDeleteTheInstallment),
        content: Text(
          AppLocalizations.of(context).appDeleteP0ThisCanT(plan.title),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(AppLocalizations.of(context).appCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(ctx).colorScheme.error,
            ),
            child: Text(AppLocalizations.of(context).appDelete),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final ok = await ref
          .read(installmentsProvider.notifier)
          .deletePlan(plan.id);
      if (context.mounted && !ok) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appWeCouldnTDeleteIt,
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
                      style: Theme.of(context).textTheme.titleMedium!
                          .copyWith(color: colors.foreground),
                    ),
                    Text(
                      AppLocalizations.of(context)
                          .appP0Month2(moneyText(context, plan.monthlyAmount)),
                      style: Theme.of(context).textTheme.titleSmall
                          ?.copyWith(color: colors.accent),
                    ),
                    if (plan.keyword.isNotEmpty &&
                        plan.keyword != plan.title) ...[
                      const SizedBox(height: SmartSpendSpacing.xs / 2),
                      Text(
                        AppLocalizations.of(context)
                            .appTrackingWordP0(plan.keyword),
                        style: Theme.of(context).textTheme.bodySmall!
                            .copyWith(color: colors.mutedForeground),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.xs),
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded, size: 20),
                color: colors.mutedForeground,
                tooltip: AppLocalizations.of(context).appDeleteTheInstallment,
                onPressed: () => _confirmDelete(context, ref),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
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
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: SmartSpendSpacing.sm,
            children: [
              Text(
                plan.done
                    ? AppLocalizations.of(context).appAllPaidP0OfP1(
                        '${plan.totalInstallments}',
                        '${plan.totalInstallments}',
                      )
                    : AppLocalizations.of(context).appPaidP0OfP1(
                        '${plan.paid}',
                        '${plan.totalInstallments}',
                      ),
                style: Theme.of(context).textTheme.bodyMedium!
                    .copyWith(color: colors.foreground),
              ),
              if (!plan.done)
                Text(
                  AppLocalizations.of(context)
                      .appP0Left(moneyText(context, plan.remainingAmount)),
                  style: Theme.of(context).textTheme.titleSmall!
                      .copyWith(color: colors.mutedForeground),
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
                AppLocalizations.of(context).appPaymentsShareANameWith,
                style: Theme.of(context).textTheme.bodySmall!
                    .copyWith(color: colors.warning),
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
                AppLocalizations.of(context).appAllPaidYouPaidP0(
                  moneyText(
                    context,
                    plan.monthlyAmount * plan.totalInstallments,
                  ),
                ),
                style: Theme.of(context).textTheme.labelMedium!
                    .copyWith(color: colors.accent),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
