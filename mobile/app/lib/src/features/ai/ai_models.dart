/// Models for AI Center, chat, reports, and voice calls (AI-01..AI-11).
library;

/// Represents a single chat message (AI-01).
final class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    this.actionDraft,
    this.clarification,
    this.isPending = false,
  });

  factory ChatMessage.fromJson(Map<String, Object?> json) {
    AiActionDraft? draft;
    AiClarification? clarification;

    final toolResults = json['toolResults'] as Map<String, Object?>?;
    final structured =
        (toolResults?['structured'] as Map<String, Object?>?) ??
        (json['structured'] as Map<String, Object?>?);

    if (structured != null) {
      final actionData = structured['action'] as Map<String, Object?>?;
      if (actionData != null) {
        draft = AiActionDraft.fromJson(actionData);
      }
      final clarificationData =
          structured['clarification'] as Map<String, Object?>?;
      if (clarificationData != null) {
        clarification = AiClarification.fromJson(clarificationData);
      }
    }

    final createdAtRaw = json['createdAt'] as String?;
    final createdAt = createdAtRaw != null
        ? DateTime.tryParse(createdAtRaw) ?? DateTime.now()
        : DateTime.now();

    return ChatMessage(
      id: (json['id'] as num?)?.toInt() ?? 0,
      role: (json['role'] as String?) ?? 'assistant',
      content: (json['content'] as String?) ?? '',
      createdAt: createdAt,
      actionDraft: draft,
      clarification: clarification,
      isPending: json['isPending'] == true,
    );
  }

  final int id;
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime createdAt;
  final AiActionDraft? actionDraft;
  final AiClarification? clarification;
  final bool isPending;

  ChatMessage copyWith({
    int? id,
    String? role,
    String? content,
    DateTime? createdAt,
    AiActionDraft? actionDraft,
    AiClarification? clarification,
    bool? isPending,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      actionDraft: actionDraft ?? this.actionDraft,
      clarification: clarification ?? this.clarification,
      isPending: isPending ?? this.isPending,
    );
  }
}

/// An action draft proposed by the AI requiring user confirmation (AI-02).
final class AiActionDraft {
  const AiActionDraft({
    required this.id,
    required this.actionName,
    required this.actionId,
    required this.summary,
    this.amounts = const [],
    this.date,
    this.status = 'pending',
    this.isHighRisk = false,
    this.confirmationPhrase,
    this.expiresAt,
  });

  factory AiActionDraft.fromJson(Map<String, Object?> json) {
    final rawAmounts = json['amounts'] as List<Object?>? ?? const [];
    final amounts = <double>[
      for (final a in rawAmounts)
        if (a is num) a.toDouble(),
    ];

    final actionName =
        (json['actionName'] as String?) ??
        (json['action'] as String?) ??
        'record.expense';
    final isHighRisk =
        json['isHighRisk'] == true ||
        actionName == 'goal.stop' ||
        actionName == 'action.undo' ||
        json['risk'] == 'high';

    String? phrase = json['confirmationPhrase'] as String?;
    if (isHighRisk && (phrase == null || phrase.isEmpty)) {
      if (actionName == 'goal.stop') {
        phrase = 'أوقف الهدف';
      } else if (actionName == 'action.undo') {
        phrase = 'تراجع عن العملية';
      } else {
        phrase = 'أكد العملية'; // The phrase the server compares; it is not translated.
      }
    }

    DateTime? expiresAt;
    final expiresRaw = json['expiresAt'] as String?;
    if (expiresRaw != null) {
      expiresAt = DateTime.tryParse(expiresRaw);
    }

    return AiActionDraft(
      id:
          (json['id'] as String?) ??
          (json['actionId'] != null ? 'act_${json['actionId']}' : 'act_0'),
      actionName: actionName,
      actionId: (json['actionId'] as num?)?.toInt() ?? 0,
      summary:
          (json['summary'] as String?) ??
          (json['title'] as String?) ??
          'إجراء مقترح',
      amounts: amounts,
      date: json['date'] as String?,
      status: (json['status'] as String?) ?? 'pending',
      isHighRisk: isHighRisk,
      confirmationPhrase: phrase,
      expiresAt: expiresAt,
    );
  }

  final String id;
  final String actionName;
  final int actionId;
  final String summary;
  final List<double> amounts;
  final String? date;
  final String status; // 'pending' | 'confirmed' | 'cancelled' | 'expired'
  final bool isHighRisk;
  final String? confirmationPhrase;
  final DateTime? expiresAt;

  bool get isExpired {
    if (status == 'expired') return true;
    if (expiresAt != null && DateTime.now().isAfter(expiresAt!)) return true;
    return false;
  }

  AiActionDraft copyWith({
    String? id,
    String? actionName,
    int? actionId,
    String? summary,
    List<double>? amounts,
    String? date,
    String? status,
    bool? isHighRisk,
    String? confirmationPhrase,
    DateTime? expiresAt,
  }) {
    return AiActionDraft(
      id: id ?? this.id,
      actionName: actionName ?? this.actionName,
      actionId: actionId ?? this.actionId,
      summary: summary ?? this.summary,
      amounts: amounts ?? this.amounts,
      date: date ?? this.date,
      status: status ?? this.status,
      isHighRisk: isHighRisk ?? this.isHighRisk,
      confirmationPhrase: confirmationPhrase ?? this.confirmationPhrase,
      expiresAt: expiresAt ?? this.expiresAt,
    );
  }
}

/// Clarification question when user request has ambiguous details.
final class AiClarification {
  const AiClarification({
    required this.question,
    this.replies = const [],
    this.missing = const [],
  });

  factory AiClarification.fromJson(Map<String, Object?> json) {
    final rawReplies = json['replies'] as List<Object?>? ?? const [];
    final rawMissing = json['missing'] as List<Object?>? ?? const [];
    return AiClarification(
      question: (json['question'] as String?) ?? '',
      replies: [
        for (final r in rawReplies)
          if (r is String) r,
      ],
      missing: [
        for (final m in rawMissing)
          if (m is String) m,
      ],
    );
  }

  final String question;
  final List<String> replies;
  final List<String> missing;
}

/// A conversation thread (AI-03).
final class ChatConversation {
  const ChatConversation({
    required this.id,
    required this.title,
    this.messageCount = 0,
    this.lastMessageAt,
  });

  factory ChatConversation.fromJson(Map<String, Object?> json) {
    DateTime? lastMsg;
    final rawDate = json['lastMessageAt'] as String?;
    if (rawDate != null) {
      lastMsg = DateTime.tryParse(rawDate);
    }
    return ChatConversation(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?) ?? 'محادثة',
      messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
      lastMessageAt: lastMsg,
    );
  }

  final int id;
  final String title;
  final int messageCount;
  final DateTime? lastMessageAt;
}

/// A piece of long-term memory about the user (AI-05).
final class AiMemory {
  const AiMemory({
    required this.id,
    required this.text,
    this.category = 'fact',
    this.createdAt,
  });

  factory AiMemory.fromJson(Map<String, Object?> json) {
    DateTime? createdAt;
    final rawDate = json['createdAt'] as String?;
    if (rawDate != null) {
      createdAt = DateTime.tryParse(rawDate);
    }
    return AiMemory(
      id: (json['id'] as num?)?.toInt() ?? 0,
      text:
          (json['content'] as String?) ??
          (json['memoryText'] as String?) ??
          (json['text'] as String?) ??
          (json['fact'] as String?) ??
          '',
      category: (json['category'] as String?) ?? 'fact',
      createdAt: createdAt,
    );
  }

  final int id;
  final String text;
  final String category;
  final DateTime? createdAt;
}

/// Monthly insights report result (AI-06).
final class MonthlyInsights {
  const MonthlyInsights({
    required this.month,
    required this.responseText,
    this.alerts = const [],
    this.personalityFlag = 'balanced',
    this.hasLowData = false,
    this.dataTable = const [],
    this.cached = false,
  });

  factory MonthlyInsights.fromJson(
    Map<String, Object?> json, {
    required String month,
  }) {
    final alertsRaw = json['alerts'] as List<Object?>? ?? const [];
    final alerts = <String>[
      for (final a in alertsRaw)
        if (a is String) a,
    ];

    final tableRaw = json['data_table'] as List<Object?>? ?? const [];
    final dataTable = <Map<String, Object?>>[
      for (final t in tableRaw)
        if (t is Map<String, Object?>) t,
    ];

    final text = (json['response_text'] as String?) ?? '';
    final hasLowData =
        text.contains('مفيش مصاريف مسجلة') ||
        text.contains('لسه مسجلتش') ||
        text.contains('بيانات غير كافية');

    return MonthlyInsights(
      month: month,
      responseText: text,
      alerts: alerts,
      personalityFlag: (json['personality_flag'] as String?) ?? 'balanced',
      hasLowData: hasLowData,
      dataTable: dataTable,
      cached: json['cached'] == true,
    );
  }

  final String month;
  final String responseText;
  final List<String> alerts;
  final String personalityFlag;
  final bool hasLowData;
  final List<Map<String, Object?>> dataTable;
  final bool cached;
}

/// Month-over-month comparison (AI-07).
final class MonthComparison {
  const MonthComparison({
    required this.firstMonth,
    required this.secondMonth,
    required this.responseText,
    this.changes = const [],
    this.totalDiff = 0.0,
  });

  factory MonthComparison.fromJson(
    Map<String, Object?> json, {
    required String firstMonth,
    required String secondMonth,
  }) {
    final changesRaw = json['changes'] as List<Object?>? ?? const [];
    final changes = <Map<String, Object?>>[
      for (final c in changesRaw)
        if (c is Map<String, Object?>) c,
    ];

    return MonthComparison(
      firstMonth: firstMonth,
      secondMonth: secondMonth,
      responseText:
          (json['response_text'] as String?) ??
          (json['comparison'] as String?) ??
          'تم تحليل الفروقات بين الشهرين.',
      changes: changes,
      totalDiff: (json['total_diff'] as num?)?.toDouble() ?? 0.0,
    );
  }

  final String firstMonth;
  final String secondMonth;
  final String responseText;
  final List<Map<String, Object?>> changes;
  final double totalDiff;
}

/// Voice call eligibility status (AI-09).
final class VoiceEligibility {
  const VoiceEligibility({
    required this.eligible,
    this.reason,
    this.plan = 'free',
    this.minutesRemaining = 0,
    this.minutesAllowed = 0,
  });

  factory VoiceEligibility.fromJson(Map<String, Object?> json) {
    return VoiceEligibility(
      eligible: json['eligible'] == true,
      reason: json['reason'] as String?,
      plan: (json['plan'] as String?) ?? 'free',
      minutesRemaining: (json['minutesRemaining'] as num?)?.toInt() ?? 0,
      minutesAllowed: (json['minutesAllowed'] as num?)?.toInt() ?? 0,
    );
  }

  final bool eligible;
  final String? reason;
  final String plan;
  final int minutesRemaining;
  final int minutesAllowed;
}

/// Historical voice call item (AI-10).
final class VoiceCallItem {
  const VoiceCallItem({
    required this.id,
    required this.callId,
    required this.startedAt,
    this.durationSeconds = 0,
    this.endedAt,
    this.status = 'completed',
  });

  factory VoiceCallItem.fromJson(Map<String, Object?> json) {
    DateTime? startedAt;
    final startRaw =
        json['startedAt'] as String? ?? json['createdAt'] as String?;
    if (startRaw != null) {
      startedAt = DateTime.tryParse(startRaw);
    }

    DateTime? endedAt;
    final endRaw = json['endedAt'] as String?;
    if (endRaw != null) {
      endedAt = DateTime.tryParse(endRaw);
    }

    return VoiceCallItem(
      id: (json['id'] as num?)?.toInt() ?? 0,
      callId:
          (json['callId'] as String?) ??
          (json['id'] != null ? 'vc_${json['id']}' : 'vc_0'),
      startedAt: startedAt ?? DateTime.now(),
      durationSeconds:
          (json['billedSeconds'] as num?)?.toInt() ??
          (json['durationSeconds'] as num?)?.toInt() ??
          (json['duration'] as num?)?.toInt() ??
          0,
      endedAt: endedAt,
      status:
          (json['endReason'] as String?) ??
          (json['status'] as String?) ??
          'completed',
    );
  }

  final int id;
  final String callId;
  final DateTime startedAt;
  final int durationSeconds;
  final DateTime? endedAt;
  final String status;
}
