import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'goal_detail_sheet.dart';
import 'goal_form_sheet.dart';
import 'goal_models.dart';
import 'goals_providers.dart';

/// The screen displaying the person's financial saving goals (`MON-04`).
class GoalsScreen extends ConsumerWidget {
  const GoalsScreen({super.key});

  static const path = '/more/goals';

  Future<void> _onAddGoal(BuildContext context, WidgetRef ref, GoalsListResponse data) async {
    final activeCount = data.goals.where((g) => g.isActive).length;
    if (!data.isPro && activeCount >= 3) {
      await showSmartSpendSheet<void>(
        context: context,
        builder: (_) => const UpgradePromptSheet(reason: UpgradeLimitReason.goals),
      );
      return;
    }
    await GoalFormSheet.show(context);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final goalsAsync = ref.watch(goalsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('أهداف التوفير'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: 'هدف جديد',
            onPressed: () {
              goalsAsync.whenData((data) {
                unawaited(_onAddGoal(context, ref, data));
              });
            },
          ),
        ],
      ),
      body: goalsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.wifi_off_rounded, size: 48, color: colors.mutedForeground),
                const SizedBox(height: SmartSpendSpacing.md),
                Text(
                  'تعذر تحميل أهداف التوفير',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  'اتأكد من اتصالك بالإنترنت وجرّب تاني',
                  style: textTheme.bodyMedium?.copyWith(color: colors.mutedForeground),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                SmartSpendButton(
                  label: 'إعادة المحاولة',
                  onPressed: () => ref.read(goalsProvider.notifier).refresh(),
                ),
              ],
            ),
          ),
        ),
        data: (data) {
          final goals = data.goals;
          if (goals.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.flag_outlined, size: 64, color: colors.accent),
                    const SizedBox(height: SmartSpendSpacing.lg),
                    Text(
                      'لسه ما حددتش أي هدف توفير',
                      style: textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: colors.foreground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.sm),
                    Text(
                      'حدد هدف توفير لمستقبلك - سواء عمرة، لابتوب جديد، أو صندوق طوارئ - وتابع خطتك بالذكاء الاصطناعي.',
                      textAlign: TextAlign.center,
                      style: textTheme.bodyMedium?.copyWith(color: colors.mutedForeground),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xl),
                    SmartSpendButton(
                      label: 'إنشاء هدف توفير جديد',
                      onPressed: () => unawaited(_onAddGoal(context, ref, data)),
                    ),
                  ],
                ),
              ),
            );
          }

          final activeGoals = goals.where((g) => g.isActive).toList();
          final completedGoals = goals.where((g) => g.isCompleted).toList();
          final pausedGoals = goals.where((g) => g.isPaused).toList();

          return RefreshIndicator(
            onRefresh: () => ref.read(goalsProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.all(SmartSpendSpacing.screen),
              children: [
                if (activeGoals.isNotEmpty) ...[
                  Text(
                    'الأهداف الحالية',
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.foreground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  ...activeGoals.map(
                    (g) => _GoalCard(
                      goal: g,
                      isPro: data.isPro,
                      onTap: () => unawaited(
                        GoalDetailSheet.show(context, goal: g, isPro: data.isPro),
                      ),
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.lg),
                ],
                if (completedGoals.isNotEmpty) ...[
                  Text(
                    'أهداف تم تحقيقها 🎯',
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.foreground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  ...completedGoals.map(
                    (g) => _GoalCard(
                      goal: g,
                      isPro: data.isPro,
                      onTap: () => unawaited(
                        GoalDetailSheet.show(context, goal: g, isPro: data.isPro),
                      ),
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.lg),
                ],
                if (pausedGoals.isNotEmpty) ...[
                  Text(
                    'أهداف متوقفة مؤقتاً',
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.foreground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  ...pausedGoals.map(
                    (g) => _GoalCard(
                      goal: g,
                      isPro: data.isPro,
                      onTap: () => unawaited(
                        GoalDetailSheet.show(context, goal: g, isPro: data.isPro),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({
    required this.goal,
    required this.isPro,
    required this.onTap,
  });

  final Goal goal;
  final bool isPro;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
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
                    radius: 20,
                    backgroundColor: colors.accent.withValues(alpha: 0.15),
                    child: Icon(
                      goal.isCompleted
                          ? Icons.emoji_events_rounded
                          : Icons.flag_rounded,
                      size: 20,
                      color: goal.isCompleted
                          ? const Color(0xFF10B981)
                          : colors.accent,
                    ),
                  ),
                  const SizedBox(width: SmartSpendSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          goal.title,
                          style: textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: colors.foreground,
                          ),
                        ),
                        Text(
                          'المستهدف: ${goal.targetAmount.toStringAsFixed(0)} ج.م',
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (goal.aiPlan != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: colors.ai.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.auto_awesome_rounded, size: 12, color: colors.ai),
                          const SizedBox(width: 4),
                          Text(
                            'خطة ذكية',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: colors.ai,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(width: 4),
                  Icon(Icons.chevron_left_rounded, color: colors.mutedForeground),
                ],
              ),
              if (goal.targetDate != null) ...[
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  'الموعد المستهدف: ${goal.targetDate!.year}/${goal.targetDate!.month}/${goal.targetDate!.day}',
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                    fontSize: 11,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
