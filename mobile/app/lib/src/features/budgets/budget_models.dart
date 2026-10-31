import 'dart:math' as math;

/// One budget status returned from `budget.list`.
final class BudgetStatus {
  const BudgetStatus({
    required this.id,
    required this.title,
    this.category,
    required this.monthlyLimit,
    this.periodStartDay = 1,
    this.linkedGoalId,
    this.alertThresholdPercent = 80,
    this.status = 'active',
    required this.currentSpent,
    required this.percentage,
    required this.isExceeded,
    required this.isNearLimit,
    this.cycleStart,
    this.cycleEnd,
  });

  final int id;
  final String title;
  final String? category;
  final double monthlyLimit;
  final int periodStartDay;
  final int? linkedGoalId;
  final int alertThresholdPercent;
  final String status;
  final double currentSpent;
  final int percentage;
  final bool isExceeded;
  final bool isNearLimit;
  final DateTime? cycleStart;
  final DateTime? cycleEnd;

  bool get isOverall => category == null || category!.trim().isEmpty;
  bool get isActive => status == 'active';
  double get remaining => math.max(0.0, monthlyLimit - currentSpent);
  double get overspent => math.max(0.0, currentSpent - monthlyLimit);

  factory BudgetStatus.fromJson(Map<String, dynamic> json) {
    return BudgetStatus(
      id: (json['id'] as num).toInt(),
      title: json['title'] as String? ?? '',
      category: json['category'] as String?,
      monthlyLimit: (num.tryParse(json['monthlyLimit']?.toString() ?? '0') ?? 0)
          .toDouble(),
      periodStartDay: (json['periodStartDay'] as num?)?.toInt() ?? 1,
      linkedGoalId: (json['linkedGoalId'] as num?)?.toInt(),
      alertThresholdPercent:
          (json['alertThresholdPercent'] as num?)?.toInt() ?? 80,
      status: json['status'] as String? ?? 'active',
      currentSpent: (json['currentSpent'] as num?)?.toDouble() ?? 0.0,
      percentage: (json['percentage'] as num?)?.toInt() ?? 0,
      isExceeded: json['isExceeded'] as bool? ?? false,
      isNearLimit: json['isNearLimit'] as bool? ?? false,
      cycleStart: json['cycleStart'] != null
          ? DateTime.tryParse(json['cycleStart'].toString())
          : null,
      cycleEnd: json['cycleEnd'] != null
          ? DateTime.tryParse(json['cycleEnd'].toString())
          : null,
    );
  }
}
