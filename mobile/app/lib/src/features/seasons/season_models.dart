import 'package:flutter/foundation.dart';

@immutable
class SeasonCategorySpending {
  const SeasonCategorySpending({
    required this.category,
    required this.amount,
    required this.count,
  });

  final String category;
  final double amount;
  final int count;

  factory SeasonCategorySpending.fromJson(Map<String, Object?> json) =>
      SeasonCategorySpending(
        category: (json['category'] as String?)?.trim() ?? '',
        amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
        count: (json['count'] as num?)?.toInt() ?? 0,
      );
}

@immutable
class PreviousSeasonSpending {
  const PreviousSeasonSpending({
    required this.startDay,
    required this.endDay,
    required this.total,
  });

  final String startDay;
  final String endDay;
  final double total;

  factory PreviousSeasonSpending.fromJson(Map<String, Object?> json) =>
      PreviousSeasonSpending(
        startDay: (json['startDay'] as String?)?.trim() ?? '',
        endDay: (json['endDay'] as String?)?.trim() ?? '',
        total: (json['total'] as num?)?.toDouble() ?? 0.0,
      );
}

@immutable
class SeasonSpending {
  const SeasonSpending({
    required this.season,
    required this.label,
    required this.startDay,
    required this.endDay,
    required this.total,
    required this.count,
    required this.byCategory,
    this.previous,
  });

  final String season;
  final String label;
  final String startDay;
  final String endDay;
  final double total;
  final int count;
  final List<SeasonCategorySpending> byCategory;
  final PreviousSeasonSpending? previous;

  int? get percentageChange {
    if (previous == null || previous!.total <= 0) return null;
    return (((total - previous!.total) / previous!.total) * 100).round();
  }

  factory SeasonSpending.fromJson(Map<String, Object?> json) {
    final rawCategories = json['byCategory'] as List<Object?>? ?? const [];
    final prevJson = json['previous'] as Map<String, Object?>?;
    return SeasonSpending(
      season: (json['season'] as String?)?.trim() ?? '',
      label: (json['label'] as String?)?.trim() ?? '',
      startDay: (json['startDay'] as String?)?.trim() ?? '',
      endDay: (json['endDay'] as String?)?.trim() ?? '',
      total: (json['total'] as num?)?.toDouble() ?? 0.0,
      count: (json['count'] as num?)?.toInt() ?? 0,
      byCategory: [
        for (final item in rawCategories)
          if (item is Map<String, Object?>)
            SeasonCategorySpending.fromJson(item),
      ],
      previous: prevJson != null ? PreviousSeasonSpending.fromJson(prevJson) : null,
    );
  }
}

const List<Map<String, String>> kAvailableSeasons = [
  {'id': 'ramadan', 'label': 'رمضان'},
  {'id': 'eid_fitr', 'label': 'عيد الفطر'},
  {'id': 'eid_adha', 'label': 'عيد الأضحى'},
  {'id': 'school', 'label': 'دخول المدارس'},
  {'id': 'summer', 'label': 'الصيف'},
];
