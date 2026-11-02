import 'dart:convert' as convert;
import 'dart:io' show Platform;

import 'package:smartspend_api/smartspend_api.dart';

import 'ai_models.dart';

/// Calls the tRPC chat, ai, voice, and export routers for AI Center.
final class AiApi {
  const AiApi(this._client);

  final TrpcClient _client;

  /// Sends a message to the assistant (AI-01).
  Future<Map<String, Object?>> sendMessage({
    required String message,
    int? conversationId,
    bool? devQaBypassDailyLimit,
  }) async {
    final res = await _client.mutate(
      Procedures.chat.sendMessage,
      input: {
        'message': message,
        'conversationId': ?conversationId,
        if (devQaBypassDailyLimit == true)
          'devQaBypassDailyLimit': devQaBypassDailyLimit,
      },
    );
    if (res is Map<String, Object?>) {
      return res;
    }
    return const {};
  }

  /// Lists user's active conversations (AI-03).
  Future<List<ChatConversation>> getConversations() async {
    final res = await _client.query(Procedures.chat.getConversations);
    if (res is List<Object?>) {
      return [
        for (final item in res)
          if (item is Map<String, Object?>) ChatConversation.fromJson(item),
      ];
    }
    return const [];
  }

  /// Fetches messages for a specific conversation (AI-03).
  Future<List<ChatMessage>> getConversation(int conversationId) async {
    final res = await _client.query(
      Procedures.chat.getConversation,
      input: {'conversationId': conversationId},
    );
    if (res is Map<String, Object?>) {
      final messages = res['messages'] as List<Object?>? ?? const [];
      return [
        for (final item in messages)
          if (item is Map<String, Object?>) ChatMessage.fromJson(item),
      ];
    }
    return const [];
  }

  /// Clears or deletes a conversation thread (AI-03).
  Future<bool> clearConversation(int conversationId) async {
    final res = await _client.mutate(
      Procedures.chat.clearConversation,
      input: {'conversationId': conversationId},
    );
    if (res is Map<String, Object?>) {
      return res['ok'] == true;
    }
    return true;
  }

  /// Confirms an action draft proposed by the AI (AI-02).
  Future<Map<String, Object?>> confirmAction({
    required int actionId,
    String? confirmationPhrase,
  }) async {
    final res = await _client.mutate(
      Procedures.chat.confirmAction,
      input: {'actionId': actionId, 'confirmationPhrase': ?confirmationPhrase},
    );
    if (res is Map<String, Object?>) {
      return res;
    }
    return const {'ok': true};
  }

  /// Cancels an action draft (AI-02).
  Future<bool> cancelAction(int actionId) async {
    final res = await _client.mutate(
      Procedures.chat.cancelAction,
      input: {'actionId': actionId},
    );
    if (res is Map<String, Object?>) {
      return res['ok'] == true;
    }
    return true;
  }

  /// Fetches quick action suggestion chips (AI-04).
  Future<List<String>> getQuickActions() async {
    final res = await _client.query(Procedures.chat.getQuickActions);
    if (res is List<Object?>) {
      return [
        for (final item in res)
          if (item is String)
            item
          else if (item is Map<String, Object?> && item['label'] is String)
            item['label'] as String,
      ];
    }
    return const [
      'ملخص مصاريف الشهر',
      'أكتر فئة بصرف فيها',
      'باقي كام على المرتب',
    ];
  }

  /// Lists remembered facts and preferences (AI-05).
  Future<List<AiMemory>> listMemories() async {
    final res = await _client.query(Procedures.chat.listMemories);
    if (res is List<Object?>) {
      return [
        for (final item in res)
          if (item is Map<String, Object?>) AiMemory.fromJson(item),
      ];
    }
    return const [];
  }

  /// Forgets a specific memory (AI-05).
  Future<bool> forgetMemory(int memoryId) async {
    final res = await _client.mutate(
      Procedures.chat.forgetMemory,
      input: {'memoryId': memoryId},
    );
    if (res is Map<String, Object?>) {
      return res['ok'] == true;
    }
    return true;
  }

  /// Clears all remembered facts (AI-05).
  Future<bool> clearAllMemories() async {
    final res = await _client.mutate(Procedures.chat.clearAllMemories);
    if (res is Map<String, Object?>) {
      return res['ok'] == true;
    }
    return true;
  }

  /// Fetches cached monthly insights for fast display (AI-06).
  Future<MonthlyInsights?> getCachedMonthlyInsights(String month) async {
    try {
      final res = await _client.query(
        Procedures.ai.getCachedMonthlyInsights,
        input: {'month': month},
      );
      if (res is Map<String, Object?> && res['insights'] != null) {
        final content = res['insights'];
        if (content is String) {
          final parsed = tryParseJson(content);
          if (parsed != null) {
            return MonthlyInsights.fromJson(parsed, month: month);
          }
        } else if (content is Map<String, Object?>) {
          return MonthlyInsights.fromJson(content, month: month);
        }
      }
    } catch (_) {
      // Return null on miss so caller can fall back or generate
    }
    return null;
  }

  /// Generates or refreshes monthly insights (AI-06).
  Future<MonthlyInsights> generateMonthlyInsights({
    required String month,
    bool forceRefresh = false,
  }) async {
    final res = await _client.mutate(
      Procedures.ai.generateMonthlyInsights,
      input: {'month': month, 'forceRefresh': forceRefresh},
    );
    if (res is Map<String, Object?>) {
      final content = res['insights'];
      if (content is String) {
        final parsed = tryParseJson(content);
        if (parsed != null) {
          return MonthlyInsights.fromJson(parsed, month: month);
        }
      } else if (content is Map<String, Object?>) {
        return MonthlyInsights.fromJson(content, month: month);
      }
    }
    return MonthlyInsights(
      month: month,
      responseText: 'تم استلام التقرير بنجاح.',
    );
  }

  /// Compares two months' financial patterns (AI-07).
  Future<MonthComparison> compareMonths({
    required String firstMonth,
    required String secondMonth,
  }) async {
    final res = await _client.mutate(
      Procedures.ai.compareMonths,
      input: {'firstMonth': firstMonth, 'secondMonth': secondMonth},
    );
    if (res is Map<String, Object?>) {
      return MonthComparison.fromJson(
        res,
        firstMonth: firstMonth,
        secondMonth: secondMonth,
      );
    }
    return MonthComparison(
      firstMonth: firstMonth,
      secondMonth: secondMonth,
      responseText: 'تمت مقارنة الشهرين.',
    );
  }

  /// Generates yearly spending and behaviour insights (AI-11).
  Future<Map<String, Object?>> generateYearlyInsights(String year) async {
    final res = await _client.mutate(
      Procedures.ai.generateYearlyInsights,
      input: {'year': year},
    );
    if (res is Map<String, Object?>) {
      return res;
    }
    return const {};
  }

  /// Exports the monthly report as HTML (AI-08).
  Future<String> exportMonthlyReportHtml(String month) async {
    final res = await _client.mutate(
      Procedures.export.monthlyReportHtml,
      input: {'month': month},
    );
    if (res is Map<String, Object?> && res['html'] is String) {
      return res['html'] as String;
    }
    if (res is String) return res;
    return '';
  }

  /// Checks voice call eligibility (AI-09).
  Future<VoiceEligibility> getVoiceEligibility() async {
    final res = await _client.query(Procedures.voice.eligibility);
    if (res is Map<String, Object?>) {
      return VoiceEligibility.fromJson(res);
    }
    return const VoiceEligibility(eligible: false);
  }

  /// Initiates a live voice call session (AI-09).
  Future<Map<String, Object?>> startVoiceCall() async {
    final clientType = Platform.isIOS ? 'ios' : 'android';
    final res = await _client.mutate(
      Procedures.voice.startCall,
      input: {'client': clientType},
    );
    if (res is Map<String, Object?>) {
      return res;
    }
    return const {};
  }

  /// Lists past voice calls (AI-10).
  Future<List<VoiceCallItem>> listVoiceCalls() async {
    final res = await _client.query(Procedures.voice.listCalls);
    if (res is Map<String, Object?>) {
      final list = res['calls'] as List<Object?>? ?? const [];
      return [
        for (final item in list)
          if (item is Map<String, Object?>) VoiceCallItem.fromJson(item),
      ];
    }
    if (res is List<Object?>) {
      return [
        for (final item in res)
          if (item is Map<String, Object?>) VoiceCallItem.fromJson(item),
      ];
    }
    return const [];
  }
}

Map<String, Object?>? tryParseJson(String text) {
  try {
    final decoded = convert.jsonDecode(text);
    if (decoded is Map<String, Object?>) return decoded;
  } catch (_) {}
  return null;
}
