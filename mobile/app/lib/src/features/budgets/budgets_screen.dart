import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

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
        title: const Text('الميزانيات الشهرية'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: 'إضافة ميزانية',
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
                  'تعذر تحميل الميزانيات',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  'اتأكد من اتصالك بالإنترنت وجرّب تاني',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                SmartSpendButton(
                  label: 'إعادة المحاولة',
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
                      'لسه ما حددتش أي ميزانية',
                      style: textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: colors.foreground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.sm),
                    Text(
                      'حدد سقف شهري لمصاريفك أو لكل تصنيف عشان تتابع اللي باقي لك أول بأول.',
                      textAlign: TextAlign.center,
                      style: textTheme.bodyMedium?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xl),
                    SmartSpendButton(
                      label: 'إضافة ميزانية شهرية',
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
                                : 'إجمالي الميزانيات',
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
                            'اتصرف: ${heroSpent.toStringAsFixed(0)} ج.م',
                            style: textTheme.bodySmall?.copyWith(
                              color: colors.mutedForeground,
                            ),
                          ),
                          Text(
                            isHeroExceeded
                                ? 'عديت بـ ${(heroSpent - heroLimit).toStringAsFixed(0)} ج.م'
                                : 'باقي: ${(heroLimit - heroSpent).toStringAsFixed(0)} ج.م',
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
                  'تفاصيل الميزانيات',
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
                                tooltip: 'تعديل',
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
                                tooltip: 'حذف',
                                onPressed: () async {
                                  final notifier = ref.read(
                                    budgetsProvider.notifier,
                                  );
                                  await notifier.deleteBudget(budget.id);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          'تم حذف ميزانية "${budget.title}"',
                                        ),
                                        action: SnackBarAction(
                                          label: 'تراجع',
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
                                'اتصرف: ${budget.currentSpent.toStringAsFixed(0)} من ${budget.monthlyLimit.toStringAsFixed(0)} ج.م',
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
                                    'عدت الميزانية (${budget.percentage}%)',
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
                                    'قربت تخلص (${budget.percentage}%)',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: colors.warning,
                                    ),
                                  ),
                                )
                              else
                                Text(
                                  'باقي: ${budget.remaining.toStringAsFixed(0)} ج.م',
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
