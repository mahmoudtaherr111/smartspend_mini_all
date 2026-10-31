import 'package:flutter/foundation.dart';

@immutable
class AiBudgetInfo {
  const AiBudgetInfo({
    required this.limit,
    required this.used,
    required this.remaining,
    required this.maxPerRequest,
  });

  final int limit;
  final int used;
  final int remaining;
  final int maxPerRequest;

  bool get isUnlimited => limit <= 0;
  bool get isLow => !isUnlimited && remaining <= 5;
  bool get isExhausted => !isUnlimited && remaining <= 0;

  double get fraction =>
      isUnlimited ? 0.0 : (limit > 0 ? (used / limit).clamp(0.0, 1.0) : 1.0);

  factory AiBudgetInfo.fromJson(Map<String, Object?> json) => AiBudgetInfo(
    limit: (json['limit'] as num?)?.toInt() ?? 0,
    used: (json['used'] as num?)?.toInt() ?? 0,
    remaining: (json['remaining'] as num?)?.toInt() ?? 0,
    maxPerRequest: (json['maxPerRequest'] as num?)?.toInt() ?? 0,
  );
}

@immutable
class VoiceLimitInfo {
  const VoiceLimitInfo({
    required this.limit,
    required this.used,
    required this.remaining,
    required this.maxPerRequest,
    this.resetDate,
  });

  final int limit;
  final int used;
  final int remaining;
  final int maxPerRequest;
  final String? resetDate;

  bool get isUnlimited => limit <= 0;
  bool get isLow => !isUnlimited && remaining <= 60; // 1 minute left
  bool get isExhausted => !isUnlimited && remaining <= 0;

  double get fraction =>
      isUnlimited ? 0.0 : (limit > 0 ? (used / limit).clamp(0.0, 1.0) : 1.0);

  factory VoiceLimitInfo.fromJson(Map<String, Object?> json) => VoiceLimitInfo(
    limit: (json['limit'] as num?)?.toInt() ?? 0,
    used: (json['used'] as num?)?.toInt() ?? 0,
    remaining: (json['remaining'] as num?)?.toInt() ?? 0,
    maxPerRequest: (json['maxPerRequest'] as num?)?.toInt() ?? 60,
    resetDate: json['resetDate'] as String?,
  );
}

@immutable
class UserLimits {
  const UserLimits({
    required this.ai,
    required this.voice,
    required this.offlineLimit,
  });

  final AiBudgetInfo ai;
  final VoiceLimitInfo voice;
  final int offlineLimit;

  factory UserLimits.fromJson(Map<String, Object?> json) {
    final aiJson = json['ai'] as Map<String, Object?>? ?? const {};
    final voiceJson = json['voice'] as Map<String, Object?>? ?? const {};
    final offlineJson = json['offline'] as Map<String, Object?>? ?? const {};
    return UserLimits(
      ai: AiBudgetInfo.fromJson(aiJson),
      voice: VoiceLimitInfo.fromJson(voiceJson),
      offlineLimit: (offlineJson['limit'] as num?)?.toInt() ?? 50,
    );
  }
}
