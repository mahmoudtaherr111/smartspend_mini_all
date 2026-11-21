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

/// One payment linked to one due date (`cashflow_settlements`), as `coach.overview` lists it under `settlements`.
final class CashflowSettlement {
  const CashflowSettlement({
    required this.id,
    required this.cashflowId,
    required this.dueDay,
    required this.amount,
    this.expenseId,
    this.source = 'linked',
  });

  factory CashflowSettlement.fromJson(Map<String, Object?> json) {
    return CashflowSettlement(
      id: (json['id'] as num?)?.toInt() ?? 0,
      cashflowId: (json['cashflowId'] as num?)?.toInt() ?? 0,
      dueDay: json['dueDay'] as String? ?? '',
      amount: readAmount(json['amount']) ?? 0,
      expenseId: (json['expenseId'] as num?)?.toInt(),
      source: json['source'] as String? ?? 'linked',
    );
  }

  final int id;
  final int cashflowId;

  /// The Cairo day key of the due date it pays: "2026-11-01".
  final String dueDay;
  final num amount;

  /// The recorded payment; null when the user said it was paid without recording it.
  final int? expenseId;

  /// 'linked' (a recorded payment) | 'declared' (paid off the records).
  final String source;
}

/// One due date of a commitment or expected income, as `coach.overview` lists it under `due` (CAL-03, CAL-04).
/// The server decides its status and what is left; the app only shows them (mobile rule 8).
final class CashflowItem {
  const CashflowItem({
    required this.cashflowId,
    required this.dueDay,
    required this.kind,
    required this.title,
    this.amount,
    this.paid = 0,
    this.remaining,
    this.direction = 'out',
    this.certainty = 'confirmed',
    this.status = 'due',
    this.contactName,
    this.contactId,
    this.settlements = const [],
  });

  factory CashflowItem.fromJson(
    Map<String, Object?> json, {
    List<CashflowSettlement> settlements = const [],
  }) {
    return CashflowItem(
      cashflowId: (json['cashflowId'] as num?)?.toInt() ?? 0,
      dueDay: json['dueDay'] as String? ?? '',
      kind: json['kind'] as String? ?? 'other',
      title: json['title'] as String? ?? '',
      amount: readAmount(json['amount']),
      paid: readAmount(json['paid']) ?? 0,
      remaining: readAmount(json['remaining']),
      direction: json['direction'] as String? ?? 'out',
      certainty: json['certainty'] as String? ?? 'confirmed',
      status: json['status'] as String? ?? 'due',
      contactName: json['contactName'] as String?,
      contactId: (json['contactId'] as num?)?.toInt(),
      settlements: settlements,
    );
  }

  /// The commitment (`scheduled_cashflows.id`) this due date belongs to.
  final int cashflowId;

  /// The Cairo day key of the due date: "2026-11-01".
  final String dueDay;
  final String kind;
  final String title;

  /// What is due on this date; null when the amount is not known.
  final num? amount;
  final num paid;

  /// What is still owed on this date; null when the amount is not known.
  final num? remaining;
  final String direction; // 'in' | 'out'
  final String certainty; // 'confirmed' | 'estimated'
  final String status; // 'paid' | 'partial' | 'due' | 'overdue' | 'unconfirmed'
  final String? contactName;
  final int? contactId;

  /// The payments linked to this due date.
  final List<CashflowSettlement> settlements;

  bool get isOverdue => status == 'overdue';
  bool get isPaid => status == 'paid';
  bool get isPartial => status == 'partial';

  /// A date before the commitment was added: the app asks whether it was paid; it is never owed.
  bool get isUnconfirmed => status == 'unconfirmed';
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
  final String? reminderStatus; // 'scheduled' | 'sent' | 'cancelled' | 'none'
  final String? remindAt;

  bool get isDone => status == 'done';
  bool get isSkipped => status == 'skipped';

  /// A cancelled or delivered reminder keeps its time on the server, so the status says whether one is waiting.
  bool get hasReminder => reminderStatus == 'scheduled';
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
    this.unknownBalanceAge = false,
    this.unknownAmounts = '',
    this.undatedItems = '',
  });

  factory CashPosition.fromJson(Map<String, Object?> json) {
    final wallets = json['wallets'] as Map<String, Object?>? ?? const {};
    final duesUnknown = json['duesUnknownAmount'] as List<Object?>? ?? const [];
    final undated = json['undated'] as List<Object?>? ?? const [];

    String titles(List<Object?> items) => items
        .map((e) => (e as Map<String, Object?>?)?['title'] as String? ?? '')
        .where((s) => s.isNotEmpty)
        .join('، ');
    final walletsCount = (wallets['count'] as num?)?.toInt() ?? 0;

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
      // The number of wallets whose balance has no known date.
      unknownBalanceAge: ((wallets['unknownAge'] as num?) ?? 0) > 0,
      unknownAmounts: titles(duesUnknown),
      undatedItems: titles(undated),
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
  final bool unknownBalanceAge;

  /// Commitments the plan cannot count, as names in one sentence; empty when there are none.
  final String unknownAmounts;
  final String undatedItems;
}

/// Full overview returned by `coach.overview`: `today` (the Cairo day), `due` (the due dates 45 days either side,
/// each with its status), `settlements` (what paid them), `position` and `plan`.
final class CoachOverviewData {
  const CoachOverviewData({
    required this.position,
    this.today,
    this.due = const [],
    this.plan,
  });

  factory CoachOverviewData.fromJson(Map<String, Object?> json) {
    final posRaw = json['position'] as Map<String, Object?>? ?? const {};
    final dueRaw = json['due'] as List<Object?>? ?? const [];
    final settlementsRaw = json['settlements'] as List<Object?>? ?? const [];
    final planRaw = json['plan'] as Map<String, Object?>?;

    final settlements = [
      for (final item in settlementsRaw)
        if (item is Map<String, Object?>) CashflowSettlement.fromJson(item),
    ];
    return CoachOverviewData(
      position: CashPosition.fromJson(posRaw),
      today: json['today'] as String?,
      due: [
        for (final item in dueRaw)
          if (item is Map<String, Object?>)
            CashflowItem.fromJson(
              item,
              settlements: [
                for (final settlement in settlements)
                  if (settlement.cashflowId ==
                          (item['cashflowId'] as num?)?.toInt() &&
                      settlement.dueDay == item['dueDay'])
                    settlement,
              ],
            ),
      ],
      plan: planRaw != null ? ActivePlan.fromJson(planRaw) : null,
    );
  }

  final CashPosition position;

  /// The server's Cairo day ("2026-11-06"); null until the server has answered.
  final String? today;

  /// Due dates in the server's order (by date).
  final List<CashflowItem> due;
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
    num? available,
  }) : available = available ?? amount;

  factory PaymentSuggestionItem.fromJson(Map<String, Object?> json) {
    return PaymentSuggestionItem(
      id: (json['id'] as num?)?.toInt() ?? 0,
      amount: readAmount(json['amount']) ?? 0,
      available: readAmount(json['available']),
      category: json['category'] as String? ?? '',
      description: json['description'] as String?,
      date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
    );
  }

  final int id;
  final num amount;

  /// What is left of the payment after its links to other due dates.
  final num available;
  final String category;
  final String? description;
  final DateTime date;
}

/// The Cairo day key [days] after [dayKey] ("2026-11-06" → "2026-11-07"), counted on UTC dates so no
/// daylight-saving change can shift it. Null when [dayKey] is not a day key.
String? addDaysToDayKey(String? dayKey, int days) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(dayKey ?? '');
  if (match == null) return null;
  final day = DateTime.utc(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!) + days,
  );
  return dayKeyOf(day);
}

/// "2026-11-06" for a calendar date.
String dayKeyOf(DateTime day) =>
    '${day.year.toString().padLeft(4, '0')}-'
    '${day.month.toString().padLeft(2, '0')}-'
    '${day.day.toString().padLeft(2, '0')}';
