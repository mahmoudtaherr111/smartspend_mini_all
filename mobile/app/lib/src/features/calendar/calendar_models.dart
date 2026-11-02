import '../ledger/ledger_models.dart' show readAmount;

/// Day cell model for the calendar month grid (CAL-01).
final class CalendarDayCell {
  const CalendarDayCell({
    required this.dateStr,
    required this.dayNumber,
    required this.amount,
    required this.income,
    required this.isToday,
    required this.isPayday,
    this.isEmpty = false,
    this.intensity = 0.0,
  });

  const CalendarDayCell.empty()
    : dateStr = '',
      dayNumber = 0,
      amount = 0,
      income = 0,
      isToday = false,
      isPayday = false,
      isEmpty = true,
      intensity = 0.0;

  final String dateStr; // YYYY-MM-DD
  final int dayNumber;
  final num amount;
  final num income;
  final bool isToday;
  final bool isPayday;
  final bool isEmpty;
  final double intensity; // 0.0 to 1.0 relative to month max daily spend
}

/// A commitment or recurring cashflow item (CAL-03, CAL-04).
final class CashflowItem {
  const CashflowItem({
    required this.id,
    required this.kind,
    required this.title,
    this.amount,
    this.dueDate,
    this.dueDay,
    this.direction = 'out',
    this.recurrence = 'monthly',
    this.status = 'due',
    this.paidAmount,
    this.contactName,
    this.contactId,
  });

  factory CashflowItem.fromJson(Map<String, Object?> json) {
    return CashflowItem(
      id: (json['id'] as num?)?.toInt() ?? 0,
      kind: json['kind'] as String? ?? 'other',
      title: json['title'] as String? ?? '',
      amount: readAmount(json['amount']),
      dueDate: json['dueDate'] as String?,
      dueDay: (json['dueDay'] as num?)?.toInt(),
      direction: json['direction'] as String? ?? 'out',
      recurrence: json['recurrence'] as String? ?? 'monthly',
      status: json['status'] as String? ?? 'due',
      paidAmount: readAmount(json['paidAmount']),
      contactName: json['contactName'] as String?,
      contactId: (json['contactId'] as num?)?.toInt(),
    );
  }

  final int id;
  final String kind;
  final String title;
  final num? amount;
  final String? dueDate;
  final int? dueDay;
  final String direction; // 'in' | 'out'
  final String recurrence; // 'monthly' | 'weekly' | 'yearly' | 'once'
  final String status; // 'paid' | 'partial' | 'due' | 'overdue' | 'unconfirmed'
  final num? paidAmount;
  final String? contactName;
  final int? contactId;

  bool get isOverdue => status == 'overdue';
  bool get isPaid => status == 'paid';
  bool get isPartial => status == 'partial';
  bool get isIncome => direction == 'in';
}

/// One step in the user's active financial plan (CAL-06).
final class PlanStep {
  const PlanStep({
    required this.id,
    required this.title,
    required this.status,
    this.reminderStatus,
    this.remindAt,
  });

  factory PlanStep.fromJson(Map<String, Object?> json) {
    return PlanStep(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      reminderStatus: json['reminderStatus'] as String?,
      remindAt: json['remindAt'] as String?,
    );
  }

  final int id;
  final String title;
  final String status; // 'pending' | 'done' | 'skipped'
  final String? reminderStatus; // 'scheduled' | 'cancelled' | 'none'
  final String? remindAt;

  bool get isDone => status == 'done';
  bool get isSkipped => status == 'skipped';
}

/// The user's active financial plan (CAL-06).
final class ActivePlan {
  const ActivePlan({
    required this.id,
    required this.title,
    this.goal,
    this.reviewDay,
    this.acceptedAt,
    this.steps = const [],
  });

  factory ActivePlan.fromJson(Map<String, Object?> json) {
    final rawSteps = json['steps'] as List<Object?>? ?? const [];
    return ActivePlan(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      goal: json['goal'] as String?,
      reviewDay: json['reviewDay'] as String?,
      acceptedAt: json['acceptedAt'] as String?,
      steps: [
        for (final raw in rawSteps)
          if (raw is Map<String, Object?>) PlanStep.fromJson(raw),
      ],
    );
  }

  final int id;
  final String title;
  final String? goal;
  final String? reviewDay;
  final String? acceptedAt;
  final List<PlanStep> steps;
}

/// Cash position summary from `coach.overview` (CAL-02).
final class CashPosition {
  const CashPosition({
    required this.untilIsPayday,
    required this.until,
    required this.days,
    required this.walletsTotal,
    required this.walletsCount,
    required this.duesKnown,
    required this.freeBeforeIncome,
    this.incomeConfirmed = 0,
    this.incomeEstimated = 0,
    this.notes = const [],
  });

  factory CashPosition.fromJson(Map<String, Object?> json) {
    final wallets = json['wallets'] as Map<String, Object?>? ?? const {};
    final duesUnknown = json['duesUnknownAmount'] as List<Object?>? ?? const [];
    final undated = json['undated'] as List<Object?>? ?? const [];

    final notes = <String>[];
    final walletsCount = (wallets['count'] as num?)?.toInt() ?? 0;
    if (walletsCount == 0) {
      notes.add('مفيش محافظ متسجلة، فالحساب بيبدأ من صفر.');
    }
    if (wallets['unknownAge'] == true) {
      notes.add('فيه رصيد مش معروف اتسجل امتى؛ حدّثه من المحافظ.');
    }
    if (duesUnknown.isNotEmpty) {
      final names = duesUnknown
          .map((e) => (e as Map<String, Object?>?)?['title'] as String? ?? '')
          .where((s) => s.isNotEmpty)
          .join('، ');
      if (names.isNotEmpty) {
        notes.add('التزامات مبلغها مش معروف: $names.');
      }
    }
    if (undated.isNotEmpty) {
      final names = undated
          .map((e) => (e as Map<String, Object?>?)?['title'] as String? ?? '')
          .where((s) => s.isNotEmpty)
          .join('، ');
      if (names.isNotEmpty) {
        notes.add('التزامات ميعادها مش معروف فمش محسوبة: $names.');
      }
    }

    return CashPosition(
      untilIsPayday: json['untilIsPayday'] == true,
      until: json['until'] as String? ?? '',
      days: (json['days'] as num?)?.toInt() ?? 0,
      walletsTotal: readAmount(wallets['total']) ?? 0,
      walletsCount: walletsCount,
      duesKnown: readAmount(json['duesKnown']) ?? 0,
      freeBeforeIncome: readAmount(json['freeBeforeIncome']) ?? 0,
      incomeConfirmed: readAmount(json['incomeConfirmed']) ?? 0,
      incomeEstimated: readAmount(json['incomeEstimated']) ?? 0,
      notes: notes,
    );
  }

  final bool untilIsPayday;
  final String until;
  final int days;
  final num walletsTotal;
  final int walletsCount;
  final num duesKnown;
  final num freeBeforeIncome;
  final num incomeConfirmed;
  final num incomeEstimated;
  final List<String> notes;
}

/// Full overview returned by `coach.overview`.
final class CoachOverviewData {
  const CoachOverviewData({
    required this.position,
    this.cashflows = const [],
    this.plan,
  });

  factory CoachOverviewData.fromJson(Map<String, Object?> json) {
    final posRaw = json['position'] as Map<String, Object?>? ?? const {};
    final cfRaw = json['cashflows'] as List<Object?>? ?? const [];
    final planRaw = json['plan'] as Map<String, Object?>?;

    return CoachOverviewData(
      position: CashPosition.fromJson(posRaw),
      cashflows: [
        for (final item in cfRaw)
          if (item is Map<String, Object?>) CashflowItem.fromJson(item),
      ],
      plan: planRaw != null ? ActivePlan.fromJson(planRaw) : null,
    );
  }

  final CashPosition position;
  final List<CashflowItem> cashflows;
  final ActivePlan? plan;
}

/// A transaction suggestion for settling a commitment (CAL-04).
final class PaymentSuggestionItem {
  const PaymentSuggestionItem({
    required this.id,
    required this.amount,
    required this.category,
    this.description,
    required this.date,
  });

  factory PaymentSuggestionItem.fromJson(Map<String, Object?> json) {
    return PaymentSuggestionItem(
      id: (json['id'] as num?)?.toInt() ?? 0,
      amount: readAmount(json['amount']) ?? 0,
      category: json['category'] as String? ?? '',
      description: json['description'] as String?,
      date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
    );
  }

  final int id;
  final num amount;
  final String category;
  final String? description;
  final DateTime date;
}
