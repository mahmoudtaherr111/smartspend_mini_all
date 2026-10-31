/// Models for Live Voice Call protocol and state machine (AI-09, GAP-06).
library;

/// Live voice call state machine states.
enum VoiceCallStatus {
  idle,
  connecting,
  listening,
  thinking,
  speaking,
  awaitingConfirmation,
  reconnecting,
  ended,
}

/// A card pushed to the live call screen by the assistant.
final class LiveCallCard {
  const LiveCallCard({
    required this.kind,
    required this.id,
    required this.title,
    this.status = 'pending',
    this.total,
    this.items = const [],
    this.message,
    this.requiresTap = false,
  });

  factory LiveCallCard.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'] as List<Object?>? ?? const [];
    final items = <Map<String, Object?>>[
      for (final i in rawItems)
        if (i is Map<String, Object?>) i,
    ];

    return LiveCallCard(
      kind: (json['kind'] as String?) ?? 'draft',
      id: (json['draftId'] as String?) ??
          (json['id'] as String?) ??
          'card_${DateTime.now().millisecondsSinceEpoch}',
      title: (json['title'] as String?) ?? 'إجراء مقترح',
      status: (json['status'] as String?) ?? 'pending',
      total: (json['total'] as num?)?.toDouble(),
      items: items,
      message: json['message'] as String?,
      requiresTap: json['requiresTap'] == true,
    );
  }

  final String kind;
  final String id;
  final String title;
  final String status;
  final double? total;
  final List<Map<String, Object?>> items;
  final String? message;
  final bool requiresTap;

  LiveCallCard copyWith({
    String? status,
    String? message,
  }) {
    return LiveCallCard(
      kind: kind,
      id: id,
      title: title,
      status: status ?? this.status,
      total: total,
      items: items,
      message: message ?? this.message,
      requiresTap: requiresTap,
    );
  }
}

/// Snapshot of the active live call state.
final class LiveCallState {
  const LiveCallState({
    this.status = VoiceCallStatus.idle,
    this.callId,
    this.durationSeconds = 0,
    this.isMuted = false,
    this.isSpeakerOn = true,
    this.assistantTranscript = '',
    this.cards = const [],
    this.errorMessage,
    this.waitDetail,
  });

  final VoiceCallStatus status;
  final String? callId;
  final int durationSeconds;
  final bool isMuted;
  final bool isSpeakerOn;
  final String assistantTranscript;
  final List<LiveCallCard> cards;
  final String? errorMessage;
  final String? waitDetail;

  LiveCallState copyWith({
    VoiceCallStatus? status,
    String? callId,
    int? durationSeconds,
    bool? isMuted,
    bool? isSpeakerOn,
    String? assistantTranscript,
    List<LiveCallCard>? cards,
    String? errorMessage,
    String? waitDetail,
  }) {
    return LiveCallState(
      status: status ?? this.status,
      callId: callId ?? this.callId,
      durationSeconds: durationSeconds ?? this.durationSeconds,
      isMuted: isMuted ?? this.isMuted,
      isSpeakerOn: isSpeakerOn ?? this.isSpeakerOn,
      assistantTranscript: assistantTranscript ?? this.assistantTranscript,
      cards: cards ?? this.cards,
      errorMessage: errorMessage ?? this.errorMessage,
      waitDetail: waitDetail ?? this.waitDetail,
    );
  }
}
