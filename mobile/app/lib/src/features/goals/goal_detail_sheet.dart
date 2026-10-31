import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'goal_models.dart';
import 'goals_providers.dart';

/// Sheet displaying a goal's details, saved AI analysis (MON-05 / GAP-16), and actions.
class GoalDetailSheet extends ConsumerStatefulWidget {
  const GoalDetailSheet({super.key, required this.goal, required this.isPro});

  final Goal goal;
  final bool isPro;

  static Future<void> show(
    BuildContext context, {
    required Goal goal,
    required bool isPro,
  }) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => GoalDetailSheet(goal: goal, isPro: isPro),
    );
  }

  @override
  ConsumerState<GoalDetailSheet> createState() => _GoalDetailSheetState();
}

class _GoalDetailSheetState extends ConsumerState<GoalDetailSheet> {
  bool _analyzing = false;
  String? _error;

  Future<void> _analyze() async {
    if (!widget.isPro) {
      await showSmartSpendSheet<void>(
        context: context,
        builder: (_) =>
            const UpgradePromptSheet(reason: UpgradeLimitReason.goals),
      );
      return;
    }

    setState(() {
      _analyzing = true;
      _error = null;
    });

    try {
      final notifier = ref.read(goalsProvider.notifier);
      await notifier.analyzeGoal(widget.goal.id);
      if (mounted) {
        setState(() => _analyzing = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _analyzing = false;
          _error = 'تعذر تشغيل التحليل بالذكاء الاصطناعي، اتأكد من اتصالك وجرّب تاني';
        });
      }
    }
  }

  Future<void> _completeGoal() async {
    final notifier = ref.read(goalsProvider.notifier);
    await notifier.setStatus(goalId: widget.goal.id, status: 'completed');

    if (mounted) {
      Navigator.of(context).pop();
      await MilestoneCelebration.show(
        context: context,
        title: 'ألف مبروك! 🎯',
        subtitle: 'حققت هدف "${widget.goal.title}" بنجاح، خطوة كبيرة لقدام!',
      );
    }
  }

  Future<void> _togglePause() async {
    final notifier = ref.read(goalsProvider.notifier);
    final newStatus = widget.goal.isActive ? 'paused' : 'active';
    await notifier.setStatus(goalId: widget.goal.id, status: newStatus);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _delete() async {
    final notifier = ref.read(goalsProvider.notifier);
    await notifier.deleteGoal(widget.goal.id);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final goal = widget.goal;
    final analysis = goal.aiPlan;

    return Padding(
      padding: EdgeInsets.only(
        top: SmartSpendSpacing.lg,
        left: SmartSpendSpacing.screen,
        right: SmartSpendSpacing.screen,
        bottom: MediaQuery.of(context).viewInsets.bottom + SmartSpendSpacing.xl,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        goal.title,
                        style: textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: colors.foreground,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'المستهدف: ${goal.targetAmount.toStringAsFixed(0)} ج.م',
                        style: textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: colors.accent,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'إغلاق',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            // Status and Date Pills
            Wrap(
              spacing: SmartSpendSpacing.sm,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: goal.isCompleted
                        ? const Color(0xFF10B981).withValues(alpha: 0.15)
                        : (goal.isActive
                              ? colors.accent.withValues(alpha: 0.15)
                              : colors.warning.withValues(alpha: 0.15)),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                  ),
                  child: Text(
                    goal.isCompleted
                        ? 'مكتمل'
                        : (goal.isActive ? 'نشط' : 'متوقف مؤقتاً'),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: goal.isCompleted
                          ? const Color(0xFF10B981)
                          : (goal.isActive ? colors.accent : colors.warning),
                    ),
                  ),
                ),
                if (goal.targetDate != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: colors.surfaceRaised,
                      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                      border: Border.all(color: colors.border),
                    ),
                    child: Text(
                      'الموعد: ${goal.targetDate!.year}/${goal.targetDate!.month}/${goal.targetDate!.day}',
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ),
              ],
            ),
            if (goal.description != null && goal.description!.isNotEmpty) ...[
              const SizedBox(height: SmartSpendSpacing.md),
              Text(
                goal.description!,
                style: textTheme.bodyMedium?.copyWith(color: colors.foreground),
              ),
            ],
            const SizedBox(height: SmartSpendSpacing.lg),
            // AI Analysis Section (MON-05 & GAP-16 saved analysis display)
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
                    children: [
                      Icon(
                        Icons.auto_awesome_rounded,
                        size: 20,
                        color: colors.ai,
                      ),
                      const SizedBox(width: SmartSpendSpacing.xs),
                      Expanded(
                        child: Text(
                          'تحليل الذكاء الاصطناعي للهدف',
                          style: textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: colors.foreground,
                          ),
                        ),
                      ),
                      if (analysis != null)
                        TextButton.icon(
                          onPressed: _analyzing ? null : _analyze,
                          icon: _analyzing
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.refresh_rounded, size: 16),
                          label: const Text(
                            'تحديث',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: TextStyle(color: colors.danger, fontSize: 12),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xs),
                  ],
                  if (analysis != null) ...[
                    if (analysis.insight != null &&
                        analysis.insight!.isNotEmpty) ...[
                      Text(
                        analysis.insight!,
                        style: textTheme.bodyMedium?.copyWith(
                          color: colors.foreground,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                    ],
                    if (analysis.plan.isNotEmpty) ...[
                      Text(
                        'خطوات الوصول للهدف:',
                        style: textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: colors.mutedForeground,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.xs),
                      ...analysis.plan.asMap().entries.map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${entry.key + 1}. ',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: colors.accent,
                                  fontSize: 13,
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  entry.value,
                                  style: textTheme.bodySmall?.copyWith(
                                    color: colors.foreground,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (analysis.weeklyActions.isNotEmpty) ...[
                      const SizedBox(height: SmartSpendSpacing.xs),
                      Text(
                        'إجراءات أسبوعية مقترحة:',
                        style: textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: colors.mutedForeground,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.xs),
                      ...analysis.weeklyActions.map(
                        (action) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '• ',
                                style: TextStyle(color: colors.accent),
                              ),
                              Expanded(
                                child: Text(
                                  action,
                                  style: textTheme.bodySmall?.copyWith(
                                    color: colors.foreground,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (goal.lastAnalyzedAt != null) ...[
                      const SizedBox(height: SmartSpendSpacing.xs),
                      Text(
                        'آخر تحليل: ${goal.lastAnalyzedAt!.year}/${goal.lastAnalyzedAt!.month}/${goal.lastAnalyzedAt!.day}',
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ] else ...[
                    Text(
                      widget.isPro
                          ? 'شغّل المستشار الذكي لتحليل ميزانيتك ومصاريفك ووضع خطة مخصصة للوصول لهدفك.'
                          : 'ميزة التحليل بالذكاء الاصطناعي متوفرة لمشتركي باقة Pro.',
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.md),
                    SmartSpendButton(
                      label: _analyzing
                          ? 'جاري تحليل الهدف...'
                          : (widget.isPro
                                ? 'تحليل الهدف بالذكاء الاصطناعي'
                                : 'ترقية إلى Pro للتحليل الذكي'),
                      onPressed: _analyzing ? null : _analyze,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            // Actions
            if (!goal.isCompleted) ...[
              SmartSpendButton(
                label: 'تم تحقيق الهدف! 🎯',
                onPressed: _completeGoal,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
            ],
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _togglePause,
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                      ),
                    ),
                    child: Text(goal.isActive ? 'إيقاف مؤقت' : 'استئناف الهدف'),
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.sm),
                IconButton(
                  icon: Icon(
                    Icons.delete_outline_rounded,
                    color: colors.danger,
                  ),
                  tooltip: 'حذف الهدف',
                  onPressed: _delete,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
