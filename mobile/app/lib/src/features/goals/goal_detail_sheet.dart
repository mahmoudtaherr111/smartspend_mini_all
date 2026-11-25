import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../plans/plan_providers.dart';
import 'goal_form_sheet.dart';
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
      scrollable: true,
      builder: (context) => GoalDetailSheet(goal: goal, isPro: isPro),
    );
  }

  @override
  ConsumerState<GoalDetailSheet> createState() => _GoalDetailSheetState();
}

class _GoalDetailSheetState extends ConsumerState<GoalDetailSheet> {
  late int _goalId = widget.goal.id;
  bool _analyzing = false;
  String? _error;

  Goal _resolveGoal() {
    final list = ref.watch(goalsProvider).value?.goals;
    if (list != null) {
      for (final g in list) {
        if (g.id == _goalId) return g;
      }
    }
    return widget.goal;
  }

  bool get _canAnalyze =>
      ref.watch(userPlanProvider).asData?.value.goalAnalysisEnabled ??
      widget.isPro;

  Future<void> _analyze(Goal goal) async {
    final allowed =
        ref.read(userPlanProvider).asData?.value.goalAnalysisEnabled ??
        widget.isPro;
    if (!allowed) {
      await showUpgradePromptSheet(
        context: context,
        reason: UpgradeLimitReason.goals,
      );
      return;
    }

    setState(() {
      _analyzing = true;
      _error = null;
    });

    try {
      final notifier = ref.read(goalsProvider.notifier);
      await notifier.analyzeGoal(goal.id);
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

  Future<void> _editGoal(Goal goal) async {
    final l10n = AppLocalizations.of(context);
    final updated = await GoalFormSheet.show(context, existing: goal);
    if (updated == true && mounted) {
      final latest = ref.read(goalsProvider).value?.goals;
      if (latest != null && latest.isNotEmpty) {
        final match = latest.where((g) => g.title == goal.title).firstOrNull;
        setState(() {
          _goalId = (match ?? latest.first).id;
        });
      }
      showSmartSpendNotice(context, l10n.goalUpdatedNotice);
    }
  }

  Future<void> _completeGoal(Goal goal) async {
    final l10n = AppLocalizations.of(context);
    final nav = Navigator.of(context);
    final rootContext = nav.context;
    final goalTitle = goal.title;
    final notifier = ref.read(goalsProvider.notifier);

    try {
      await notifier.setStatus(goalId: goal.id, status: 'completed');
      if (mounted) {
        nav.pop();
      }
      if (rootContext.mounted) {
        await MilestoneCelebration.show(
          context: rootContext,
          title: l10n.monCongratulations,
          subtitle: l10n.monYouReachedYourGoalP0(goalTitle),
        );
      }
    } catch (_) {
      if (mounted) {
        showSmartSpendNotice(context, l10n.genericActionFailed);
      }
    }
  }

  Future<void> _togglePause(Goal goal) async {
    final l10n = AppLocalizations.of(context);
    final notifier = ref.read(goalsProvider.notifier);
    final newStatus = goal.isActive ? 'paused' : 'active';
    try {
      await notifier.setStatus(goalId: goal.id, status: newStatus);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        showSmartSpendNotice(context, l10n.genericActionFailed);
      }
    }
  }

  Future<void> _delete(Goal goal) async {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text(l10n.goalDeleteConfirmTitle),
        content: Text(l10n.goalDeleteConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: Text(l10n.monCancel),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: colors.danger),
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: Text(l10n.confirmDeleteAction),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final nav = Navigator.of(context);
    final rootContext = nav.context;
    try {
      final notifier = ref.read(goalsProvider.notifier);
      await notifier.deleteGoal(goal.id);
      if (mounted) {
        nav.pop();
      }
      if (rootContext.mounted) {
        showSmartSpendNotice(rootContext, l10n.goalDeletedNotice);
      }
    } catch (_) {
      if (mounted) {
        showSmartSpendNotice(context, l10n.genericActionFailed);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final goal = _resolveGoal();
    final analysis = goal.aiPlan;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        SmartSpendSpacing.lg,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xl,
      ),
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
                      l10n.monTargetP0(moneyText(context, goal.targetAmount)),
                      style: textTheme.titleSmall?.copyWith(
                        color: colors.accent,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.edit_outlined),
                tooltip: l10n.goalEditAction,
                onPressed: () => _editGoal(goal),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                tooltip: l10n.monClose,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          // Status and Date Pills
          Wrap(
            spacing: SmartSpendSpacing.sm,
            runSpacing: SmartSpendSpacing.xs,
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
                      ? l10n.monReached
                      : (goal.isActive ? l10n.monActive : l10n.monPaused),
                  style: textTheme.labelMedium?.copyWith(
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
                    l10n.monDateP0P1P2(
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
                        l10n.monGoalAnalysis,
                        style: textTheme.titleSmall?.copyWith(
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    if (analysis != null)
                      TextButton.icon(
                        onPressed: _analyzing ? null : () => _analyze(goal),
                        icon: _analyzing
                            ? const SizedBox.square(
                                dimension: SmartSpendSpacing.md,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.refresh_rounded, size: 16),
                        label: Text(
                          l10n.monRefresh,
                          style: textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                if (_error != null) ...[
                  Text(
                    _error!,
                    style: textTheme.bodySmall?.copyWith(color: colors.danger),
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
                      l10n.monStepsToYourGoal,
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
                              style: textTheme.titleSmall?.copyWith(
                                color: colors.accent,
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
                      l10n.monSuggestedWeeklyActions,
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
                              style: textTheme.bodyMedium?.copyWith(
                                color: colors.accent,
                              ),
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
                      l10n.monLastAnalysisP0P1P2(
                        DateWords.of(context).date(goal.lastAnalyzedAt!),
                      ),
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ],
                ] else ...[
                  Text(
                    _canAnalyze
                        ? l10n.monRunTheAnalysisToGet
                        : l10n.monGoalAnalysisComesWithPro,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.md),
                  SmartSpendButton(
                    label: _analyzing
                        ? l10n.monAnalyzing
                        : (_canAnalyze
                              ? l10n.monAnalyzeThisGoal
                              : l10n.monUpgradeToProForThe),
                    onPressed: _analyzing ? null : () => _analyze(goal),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          // Actions
          if (!goal.isCompleted) ...[
            SmartSpendButton(
              label: l10n.monGoalReached,
              onPressed: () => _completeGoal(goal),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _togglePause(goal),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      vertical: SmartSpendSpacing.md,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                  child: Text(
                    goal.isActive ? l10n.monPause : l10n.monResumeTheGoal,
                  ),
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.sm),
              IconButton(
                icon: Icon(Icons.delete_outline_rounded, color: colors.danger),
                tooltip: l10n.monDeleteTheGoal,
                onPressed: () => _delete(goal),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
