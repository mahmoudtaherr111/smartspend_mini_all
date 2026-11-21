/// Parsed AI analysis saved on a goal (`financial_goals.ai_plan`).
final class GoalAnalysis {
  const GoalAnalysis({
    this.insight,
    this.plan = const [],
    this.weeklyActions = const [],
    this.alerts = const [],
    this.progressPercent,
  });

  final String? insight;
  final List<String> plan;
  final List<String> weeklyActions;
  final List<String> alerts;
  final int? progressPercent;

  factory GoalAnalysis.fromJson(Map<String, dynamic> json) {
    List<String> listFrom(dynamic v) {
      if (v is List) {
        return v
            .map((e) => e?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList();
      }
      return const [];
    }

    final rawPercent = json['progress_percent'] ?? json['progressPercent'];
    final percent = rawPercent is num
        ? rawPercent.toInt()
        : int.tryParse(rawPercent?.toString() ?? '');

    return GoalAnalysis(
      insight: json['insight'] as String?,
      plan: listFrom(json['plan']),
      weeklyActions: listFrom(json['weekly_actions'] ?? json['weeklyActions']),
      alerts: listFrom(json['alerts']),
      progressPercent: percent,
    );
  }
}

/// One financial goal (`financial_goals`).
final class Goal {
  const Goal({
    required this.id,
    required this.title,
    this.description,
    required this.targetAmount,
    this.targetDate,
    required this.status,
    this.aiPlan,
    this.lastAnalyzedAt,
    this.createdAt,
  });

  final int id;
  final String title;
  final String? description;
  final double targetAmount;
  final DateTime? targetDate;
  final String status;
  final GoalAnalysis? aiPlan;
  final DateTime? lastAnalyzedAt;
  final DateTime? createdAt;

  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
  bool get isPaused => status == 'paused';

  factory Goal.fromJson(Map<String, dynamic> json) {
    GoalAnalysis? parsedAnalysis;
    final rawPlan = json['aiPlan'] ?? json['ai_plan'];
    if (rawPlan is Map<String, dynamic>) {
      parsedAnalysis = GoalAnalysis.fromJson(rawPlan);
    }

    return Goal(
      id: (json['id'] as num).toInt(),
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      targetAmount: (num.tryParse(json['targetAmount']?.toString() ?? '0') ?? 0)
          .toDouble(),
      targetDate: json['targetDate'] != null
          ? DateTime.tryParse(json['targetDate'].toString())
          : null,
      status: json['status'] as String? ?? 'active',
      aiPlan: parsedAnalysis,
      lastAnalyzedAt: json['lastAnalyzedAt'] != null
          ? DateTime.tryParse(json['lastAnalyzedAt'].toString())
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}

final class GoalsListResponse {
  const GoalsListResponse({required this.goals, required this.isPro});

  final List<Goal> goals;
  final bool isPro;
}
