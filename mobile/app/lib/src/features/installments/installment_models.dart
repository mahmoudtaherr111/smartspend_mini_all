import 'package:flutter/foundation.dart';

@immutable
class InstallmentPlan {
  const InstallmentPlan({
    required this.id,
    required this.title,
    required this.keyword,
    required this.monthlyAmount,
    required this.totalInstallments,
    required this.paid,
    required this.remaining,
    required this.remainingAmount,
    required this.done,
    this.countedBy = 'keyword',
  });

  final int id;
  final String title;
  final String keyword;
  final double monthlyAmount;
  final int totalInstallments;
  final int paid;
  final int remaining;
  final double remainingAmount;
  final bool done;
  final String countedBy;

  bool get isAmbiguous => countedBy == 'ambiguous';
  bool get isLinked => countedBy == 'linked';

  double get progressFraction {
    if (totalInstallments <= 0) return 0.0;
    return (paid / totalInstallments).clamp(0.0, 1.0);
  }

  factory InstallmentPlan.fromJson(Map<String, Object?> json) {
    return InstallmentPlan(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim() ?? '',
      keyword: (json['keyword'] as String?)?.trim() ?? '',
      monthlyAmount: (json['monthlyAmount'] as num?)?.toDouble() ?? 0.0,
      totalInstallments: (json['totalInstallments'] as num?)?.toInt() ?? 0,
      paid: (json['paid'] as num?)?.toInt() ?? 0,
      remaining: (json['remaining'] as num?)?.toInt() ?? 0,
      remainingAmount: (json['remainingAmount'] as num?)?.toDouble() ?? 0.0,
      done: json['done'] == true,
      countedBy: (json['countedBy'] as String?) ?? 'keyword',
    );
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'keyword': keyword,
    'monthlyAmount': monthlyAmount,
    'totalInstallments': totalInstallments,
    'paid': paid,
    'remaining': remaining,
    'remainingAmount': remainingAmount,
    'done': done,
    'countedBy': countedBy,
  };
}

@immutable
class CreateInstallmentInput {
  const CreateInstallmentInput({
    required this.title,
    required this.keyword,
    required this.monthlyAmount,
    required this.totalInstallments,
    this.paidBefore = 0,
  });

  final String title;
  final String keyword;
  final double monthlyAmount;
  final int totalInstallments;
  final int paidBefore;

  Map<String, Object?> toJson() => {
    'title': title,
    'keyword': keyword.isEmpty ? title : keyword,
    'monthlyAmount': monthlyAmount,
    'totalInstallments': totalInstallments,
    'paidBefore': paidBefore,
  };
}
