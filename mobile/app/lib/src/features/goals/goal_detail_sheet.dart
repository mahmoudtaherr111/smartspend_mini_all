import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
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
          _error = AppLocalizations.of(context).monWeCouldnTRunThe;
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
        title: AppLocalizations.of(context).monCongratulations,
        subtitle: AppLocalizations.of(context)
            .monYouReachedYourGoalP0(widget.goal.title),
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
                          color: colors.foreground,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.xs / 2),
                      Text(
                        AppLocalizations.of(context)
                            .monTargetP0(moneyText(context, goal.targetAmount)),
                        style: textTheme.titleSmall?.copyWith(
                          color: colors.accent,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: AppLocalizations.of(context).monClose,
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
                    horizontal: SmartSpendSpacing.sm,
                    vertical: SmartSpendSpacing.xs,
                  ),
                  decoration: BoxDecoration(
                    color: goal.isCompleted
                        ? colors.accent.withValues(alpha: 0.15)
                        : (goal.isActive
                              ? colors.accent.withValues(alpha: 0.15)
                              : colors.warning.withValues(alpha: 0.15)),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                  ),
                  child: Text(
                    goal.isCompleted
                        ? AppLocalizations.of(context).monReached
                        : (goal.isActive
                              ? AppLocalizations.of(context).monActive
                              : AppLocalizations.of(context).monPaused),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: goal.isCompleted
                          ? colors.accent
                          : (goal.isActive ? colors.accent : colors.warning),
                    ),
                  ),
                ),
                if (goal.targetDate != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: SmartSpendSpacing.sm,
                      vertical: SmartSpendSpacing.xs,
                    ),
                    decoration: BoxDecoration(
                      color: colors.surfaceRaised,
                      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                    ),
                    child: Text(
                      AppLocalizations.of(context).monDateP0P1P2(
                        DateWords.of(context).date(goal.targetDate!),
                      ),
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
                          AppLocalizations.of(context).monGoalAnalysis,
                          style: textTheme.titleSmall?.copyWith(
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
                          label: Text(
                            AppLocalizations.of(context).monRefresh,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: colors.danger),
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
                        AppLocalizations.of(context).monStepsToYourGoal,
                        style: textTheme.labelMedium?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.xs),
                      ...analysis.plan.asMap().entries.map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(
                            bottom: SmartSpendSpacing.xs,
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${entry.key + 1}. ',
                                style: Theme.of(context).textTheme.titleSmall
                                    ?.copyWith(color: colors.accent),
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
                        AppLocalizations.of(context).monSuggestedWeeklyActions,
                        style: textTheme.labelMedium?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.xs),
                      ...analysis.weeklyActions.map(
                        (action) => Padding(
                          padding: const EdgeInsets.only(
                            bottom: SmartSpendSpacing.xs,
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '• ',
                                style: Theme.of(context).textTheme.bodyMedium
                                    ?.copyWith(color: colors.accent),
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
                        AppLocalizations.of(context).monLastAnalysisP0P1P2(
                          DateWords.of(context).date(goal.lastAnalyzedAt!),
                        ),
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ],
                  ] else ...[
                    Text(
                      widget.isPro
                          ? AppLocalizations.of(context).monRunTheAnalysisToGet
                          : AppLocalizations.of(context)
                                .monGoalAnalysisComesWithPro,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.md),
                    SmartSpendButton(
                      label: _analyzing
                          ? AppLocalizations.of(context).monAnalyzing
                          : (widget.isPro
                                ? AppLocalizations.of(context)
                                      .monAnalyzeThisGoal
                                : AppLocalizations.of(context)
                                      .monUpgradeToProForThe),
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
                label: AppLocalizations.of(context).monGoalReached,
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
                      padding: const EdgeInsets.symmetric(
                        vertical: SmartSpendSpacing.md,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                      ),
                    ),
                    child: Text(
                      goal.isActive
                          ? AppLocalizations.of(context).monPause
                          : AppLocalizations.of(context).monResumeTheGoal,
                    ),
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.sm),
                IconButton(
                  icon: Icon(
                    Icons.delete_outline_rounded,
                    color: colors.danger,
                  ),
                  tooltip: AppLocalizations.of(context).monDeleteTheGoal,
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
