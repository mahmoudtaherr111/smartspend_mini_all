import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/category_style.dart';
import 'budget_form_sheet.dart';
import 'budget_providers.dart';

/// The screen displaying the person's monthly budgets (`MON-06`).
class BudgetsScreen extends ConsumerWidget {
  const BudgetsScreen({super.key});

  static const path = '/more/budgets';

  static const Color _positiveGreen = Color(0xFF10B981);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final budgetsAsync = ref.watch(budgetsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).monMonthlyBudgets),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: AppLocalizations.of(context).monAddABudget,
            onPressed: () => unawaited(BudgetFormSheet.show(context)),
          ),
        ],
      ),
      body: budgetsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.wifi_off_rounded,
                  size: 48,
                  color: colors.mutedForeground,
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                Text(
                  AppLocalizations.of(context).monWeCanTLoadYour,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  AppLocalizations.of(context).monCheckYourConnectionAndTry,
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                SmartSpendButton(
                  label: AppLocalizations.of(context).monTryAgain,
                  onPressed: () => ref.read(budgetsProvider.notifier).refresh(),
                ),
              ],
            ),
          ),
        ),
        data: (budgets) {
          if (budgets.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.savings_outlined,
                      size: 64,
                      color: colors.accent,
                    ),
                    const SizedBox(height: SmartSpendSpacing.lg),
                    Text(
                      AppLocalizations.of(context).monNoBudgetsYet,
                      style: textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: colors.foreground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.sm),
                    Text(
                      AppLocalizations.of(context).monSetAMonthlyLimitFor,
                      textAlign: TextAlign.center,
                      style: textTheme.bodyMedium?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xl),
                    SmartSpendButton(
                      label: AppLocalizations.of(context).monAddAMonthlyBudget,
                      onPressed: () => unawaited(BudgetFormSheet.show(context)),
                    ),
                  ],
                ),
              ),
            );
          }

          // Compute overall stats
          final overall = budgets.where((b) => b.isOverall).firstOrNull;
          final categoryBudgets = budgets.where((b) => !b.isOverall).toList();

          final heroLimit =
              overall?.monthlyLimit ??
              categoryBudgets.fold<double>(
                0.0,
                (sum, b) => sum + b.monthlyLimit,
              );
          final heroSpent =
              overall?.currentSpent ??
              categoryBudgets.fold<double>(
                0.0,
                (sum, b) => sum + b.currentSpent,
              );
          final heroPercentage = heroLimit > 0
              ? ((heroSpent / heroLimit) * 100).round()
              : 0;
          final isHeroExceeded = heroSpent > heroLimit;

          return RefreshIndicator(
            onRefresh: () => ref.read(budgetsProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.all(SmartSpendSpacing.screen),
              children: [
                // Hero Summary Card
                Container(
                  padding: const EdgeInsets.all(SmartSpendSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
                    border: Border.all(color: colors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            overall != null
                                ? overall.title
                                : AppLocalizations.of(context).monAllBudgets,
                            style: textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: colors.foreground,
                            ),
                          ),
                          Text(
                            '$heroPercentage%',
                            style: textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: isHeroExceeded
                                  ? colors.danger
                                  : (heroPercentage >= 80
                                        ? colors.warning
                                        : colors.accent),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: heroLimit > 0
                              ? (heroSpent / heroLimit).clamp(0.0, 1.0)
                              : 0.0,
                          minHeight: 10,
                          backgroundColor: colors.border,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            isHeroExceeded
                                ? colors.danger
                                : (heroPercentage >= 80
                                      ? colors.warning
                                      : colors.accent),
                          ),
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            AppLocalizations.of(context)
                                .monSpentP0(moneyText(context, heroSpent)),
                            style: textTheme.bodySmall?.copyWith(
                              color: colors.mutedForeground,
                            ),
                          ),
                          Text(
                            isHeroExceeded
                                ? AppLocalizations.of(context).monOverByP0(
                                    moneyText(context, heroSpent - heroLimit),
                                  )
                                : AppLocalizations.of(context).monLeftP0(
                                    moneyText(context, heroLimit - heroSpent),
                                  ),
                            style: textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: isHeroExceeded
                                  ? colors.danger
                                  : _positiveGreen,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                // Section Title
                Text(
                  AppLocalizations.of(context).monBudgetDetails,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                ...budgets.map((budget) {
                  final cat = budget.category;
                  final icon = cat != null && cat.isNotEmpty
                      ? categoryIcon(cat)
                      : Icons.account_balance_wallet_rounded;
                  final iconColor = cat != null && cat.isNotEmpty
                      ? categoryColor(context, cat)
                      : colors.accent;

                  return Padding(
                    padding: const EdgeInsets.only(
                      bottom: SmartSpendSpacing.md,
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(SmartSpendSpacing.md),
                      decoration: BoxDecoration(
                        color: colors.surface,
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                        border: Border.all(color: colors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 18,
                                backgroundColor: iconColor.withValues(
                                  alpha: 0.15,
                                ),
                                child: Icon(icon, size: 18, color: iconColor),
                              ),
                              const SizedBox(width: SmartSpendSpacing.sm),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      budget.title,
                                      style: textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: colors.foreground,
                                      ),
                                    ),
                                    if (budget.category != null &&
                                        budget.category != budget.title)
                                      Text(
                                        budget.category!,
                                        style: textTheme.bodySmall?.copyWith(
                                          color: colors.mutedForeground,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.edit_outlined, size: 20),
                                tooltip: AppLocalizations.of(context).monEdit,
                                onPressed: () => unawaited(
                                  BudgetFormSheet.show(
                                    context,
                                    existing: budget,
                                  ),
                                ),
                              ),
                              IconButton(
                                icon: Icon(
                                  Icons.delete_outline_rounded,
                                  size: 20,
                                  color: colors.danger,
                                ),
                                tooltip: AppLocalizations.of(context).monDelete,
                                onPressed: () async {
                                  final confirmed = await showDialog<bool>(
                                    context: context,
                                    builder: (dialogCtx) => AlertDialog(
                                      title: Text(
                                        AppLocalizations.of(context)
                                            .monDeleteTheBudget,
                                      ),
                                      content: Text(
                                        AppLocalizations.of(context)
                                            .monDeleteTheBudgetP0(budget.title),
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.of(dialogCtx)
                                                  .pop(false),
                                          child: Text(
                                            AppLocalizations.of(context)
                                                .monCancel,
                                          ),
                                        ),
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.of(dialogCtx).pop(true),
                                          style: TextButton.styleFrom(
                                            foregroundColor: colors.danger,
                                          ),
                                          child: Text(
                                            AppLocalizations.of(context)
                                                .monDelete,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );

                                  if (confirmed != true || !context.mounted) {
                                    return;
                                  }

                                  final notifier = ref.read(
                                    budgetsProvider.notifier,
                                  );
                                  await notifier.deleteBudget(budget.id);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          AppLocalizations.of(context)
                                              .monBudgetP0Deleted(budget.title),
                                        ),
                                        action: SnackBarAction(
                                          label: AppLocalizations.of(context)
                                              .monUndo,
                                          onPressed: () => unawaited(
                                            notifier.restoreBudget(budget),
                                          ),
                                        ),
                                      ),
                                    );
                                  }
                                },
                              ),
                            ],
                          ),
                          const SizedBox(height: SmartSpendSpacing.sm),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: budget.monthlyLimit > 0
                                  ? (budget.currentSpent / budget.monthlyLimit)
                                        .clamp(0.0, 1.0)
                                  : 0.0,
                              minHeight: 8,
                              backgroundColor: colors.border,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                budget.isExceeded
                                    ? colors.danger
                                    : (budget.isNearLimit
                                          ? colors.warning
                                          : colors.accent),
                              ),
                            ),
                          ),
                          const SizedBox(height: SmartSpendSpacing.xs),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                AppLocalizations.of(context).monSpentP0OfP1(
                                  moneyText(context, budget.currentSpent),
                                  moneyText(context, budget.monthlyLimit),
                                ),
                                style: textTheme.bodySmall?.copyWith(
                                  color: colors.mutedForeground,
                                ),
                              ),
                              if (budget.isExceeded)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: colors.danger.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(
                                      SmartSpendRadii.sm,
                                    ),
                                  ),
                                  child: Text(
                                    AppLocalizations.of(
                                      context,
                                    ).monOverBudgetP0('${budget.percentage}'),
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: colors.danger,
                                    ),
                                  ),
                                )
                              else if (budget.isNearLimit)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: colors.warning.withValues(
                                      alpha: 0.1,
                                    ),
                                    borderRadius: BorderRadius.circular(
                                      SmartSpendRadii.sm,
                                    ),
                                  ),
                                  child: Text(
                                    AppLocalizations.of(
                                      context,
                                    ).monAlmostUsedP0('${budget.percentage}'),
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: colors.warning,
                                    ),
                                  ),
                                )
                              else
                                Text(
                                  AppLocalizations.of(context).monLeftP02(
                                    moneyText(context, budget.remaining),
                                  ),
                                  style: textTheme.bodySmall?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: _positiveGreen,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
          );
        },
      ),
    );
  }
}
