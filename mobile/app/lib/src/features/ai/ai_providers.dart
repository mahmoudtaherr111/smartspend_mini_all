import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../calendar/calendar_providers.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/offline/outbox.dart';
import '../stats/stats_providers.dart';
import '../wallets/wallet_providers.dart';
import 'ai_api.dart';
import 'ai_models.dart';

final aiApiProvider = Provider<AiApi>(
  (ref) => AiApi(ref.watch(trpcClientProvider)),
);

/// Currently active conversation ID (null means a fresh conversation) (AI-03).
class ActiveConversationIdNotifier extends Notifier<int?> {
  @override
  int? build() => null;

  void select(int? conversationId) => state = conversationId;
}

final activeConversationIdProvider =
    NotifierProvider<ActiveConversationIdNotifier, int?>(
  ActiveConversationIdNotifier.new,
);

/// Preserved message draft across network errors and daily limit errors (AI-01).
class ChatDraftNotifier extends Notifier<String> {
  @override
  String build() => '';

  void set(String text) => state = text;
  void clear() => state = '';
}

final chatDraftProvider =
    NotifierProvider<ChatDraftNotifier, String>(ChatDraftNotifier.new);

/// Error state when the daily message limit is reached (AI-01).
class DailyLimitErrorNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? error) => state = error;
  void clear() => state = null;
}

final dailyLimitErrorProvider =
    NotifierProvider<DailyLimitErrorNotifier, String?>(
  DailyLimitErrorNotifier.new,
);

/// Indicates if the assistant is currently generating a response (AI-01).
class IsAssistantTypingNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool typing) => state = typing;
}

final isAssistantTypingProvider =
    NotifierProvider<IsAssistantTypingNotifier, bool>(
  IsAssistantTypingNotifier.new,
);

/// Messages in the active conversation thread (AI-01).
class ChatMessagesNotifier
    extends Notifier<AsyncValue<List<ChatMessage>>> {
  @override
  AsyncValue<List<ChatMessage>> build() {
    final convId = ref.watch(activeConversationIdProvider);
    if (convId == null) {
      return const AsyncValue.data([]);
    }

    // Load existing messages asynchronously
    Future.microtask(() => loadConversation(convId));
    return const AsyncValue.loading();
  }

  Future<void> loadConversation(int conversationId) async {
    state = const AsyncValue.loading();
    try {
      final messages =
          await ref.read(aiApiProvider).getConversation(conversationId);
      state = AsyncValue.data(messages);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Sends a message, adding it optimistically, displaying typing indicator,
  /// and handling daily limit / offline cases (AI-01).
  Future<bool> sendMessage(String text) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty) return false;

    // Check connectivity
    final isOnline = ref.read(connectivityProvider).asData?.value ?? true;
    if (!isOnline) {
      ref.read(chatDraftProvider.notifier).set(cleanText);
      return false;
    }

    final currentMessages = state.value ?? [];
    final tempUserMessage = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch,
      role: 'user',
      content: cleanText,
      createdAt: DateTime.now(),
    );

    // Optimistically append user message and start typing indicator
    state = AsyncValue.data([...currentMessages, tempUserMessage]);
    ref.read(isAssistantTypingProvider.notifier).set(true);
    ref.read(dailyLimitErrorProvider.notifier).clear();

    final activeConvId = ref.read(activeConversationIdProvider);

    try {
      final res = await ref.read(aiApiProvider).sendMessage(
        message: cleanText,
        conversationId: activeConvId,
      );

      final newConvId = (res['conversationId'] as num?)?.toInt();
      if (newConvId != null && activeConvId == null) {
        ref.read(activeConversationIdProvider.notifier).select(newConvId);
        ref.invalidate(chatConversationsProvider);
      }

      final responseText = (res['response'] as String?) ?? 'تمام.';
      AiActionDraft? actionDraft;
      AiClarification? clarification;

      final structured = res['structured'] as Map<String, Object?>?;
      if (structured != null) {
        final actionData = structured['action'] as Map<String, Object?>?;
        if (actionData != null) {
          actionDraft = AiActionDraft.fromJson(actionData);
        }
        final clarificationData =
            structured['clarification'] as Map<String, Object?>?;
        if (clarificationData != null) {
          clarification = AiClarification.fromJson(clarificationData);
        }
      }

      final assistantMessage = ChatMessage(
        id: DateTime.now().millisecondsSinceEpoch + 1,
        role: 'assistant',
        content: responseText,
        createdAt: DateTime.now(),
        actionDraft: actionDraft,
        clarification: clarification,
      );

      state = AsyncValue.data([...state.value ?? [], assistantMessage]);
      ref.read(chatDraftProvider.notifier).clear();
      ref.read(isAssistantTypingProvider.notifier).set(false);
      return true;
    } on ApiException catch (e) {
      ref.read(isAssistantTypingProvider.notifier).set(false);
      // Roll back optimistic user bubble so no stuck bubble or duplicate send occurs
      state = AsyncValue.data(currentMessages);
      ref.read(chatDraftProvider.notifier).set(cleanText);
      if (e.code == 'TOO_MANY_REQUESTS') {
        // Daily limit reached: keep draft and show server's message + upgrade path
        ref.read(dailyLimitErrorProvider.notifier).set(e.message);
      }
      return false;
    } catch (_) {
      ref.read(isAssistantTypingProvider.notifier).set(false);
      // Roll back optimistic user bubble
      state = AsyncValue.data(currentMessages);
      ref.read(chatDraftProvider.notifier).set(cleanText);
      return false;
    }
  }

  /// Updates status of an action draft in message list when confirmed or cancelled (AI-02).
  void updateActionStatus(String actionDraftId, String newStatus) {
    final list = state.value;
    if (list == null) return;
    final updated = list.map((msg) {
      if (msg.actionDraft?.id == actionDraftId) {
        return msg.copyWith(
          actionDraft: msg.actionDraft!.copyWith(status: newStatus),
        );
      }
      return msg;
    }).toList();
    state = AsyncValue.data(updated);
  }

  void clearLocal() {
    state = const AsyncValue.data([]);
    ref.read(chatDraftProvider.notifier).clear();
    ref.read(dailyLimitErrorProvider.notifier).clear();
  }
}

final chatMessagesProvider = NotifierProvider<ChatMessagesNotifier,
    AsyncValue<List<ChatMessage>>>(ChatMessagesNotifier.new);

/// List of past conversation threads (AI-03).
final chatConversationsProvider =
    FutureProvider<List<ChatConversation>>((ref) async {
  return ref.watch(aiApiProvider).getConversations();
});

/// Quick questions suggestion chips (AI-04).
final quickQuestionsProvider = FutureProvider<List<String>>((ref) async {
  return ref.watch(aiApiProvider).getQuickActions();
});

/// Long-term memories list (AI-05).
final aiMemoriesProvider = FutureProvider<List<AiMemory>>((ref) async {
  return ref.watch(aiApiProvider).listMemories();
});

/// Selected month for monthly reports and comparisons (e.g. "2026-10") (AI-06).
class SelectedReportMonthNotifier extends Notifier<String> {
  @override
  String build() {
    return DateFormat('yyyy-MM').format(DateTime.now());
  }

  void select(String month) => state = month;
}

final selectedReportMonthProvider =
    NotifierProvider<SelectedReportMonthNotifier, String>(
  SelectedReportMonthNotifier.new,
);

/// Cached and generated monthly report insights (AI-06).
final monthlyReportFamily =
    FutureProvider.family<MonthlyInsights, String>((ref, month) async {
  final api = ref.watch(aiApiProvider);
  final cached = await api.getCachedMonthlyInsights(month);
  if (cached != null) return cached;
  return api.generateMonthlyInsights(month: month);
});

/// Month-over-month comparison provider (AI-07).
final monthComparisonFamily =
    FutureProvider.family<MonthComparison, (String, String)>((ref, pair) async {
  return ref.watch(aiApiProvider).compareMonths(
        firstMonth: pair.$1,
        secondMonth: pair.$2,
      );
});

/// Voice call eligibility (AI-09).
final voiceEligibilityProvider = FutureProvider<VoiceEligibility>((ref) async {
  return ref.watch(aiApiProvider).getVoiceEligibility();
});

/// Past voice call history (AI-10).
final pastVoiceCallsProvider = FutureProvider<List<VoiceCallItem>>((ref) async {
  return ref.watch(aiApiProvider).listVoiceCalls();
});

/// Refreshes all ledger screens when an AI action executes (AI-02).
void refreshLedgerViews(Ref ref) {
  ref.invalidate(monthSummaryProvider);
  ref.invalidate(recentEntriesProvider);
  ref.invalidate(allEntriesProvider);
  ref.invalidate(walletsProvider);
  ref.invalidate(monthStatsProvider);
  ref.invalidate(coachOverviewProvider);
}

/// Refreshes all ledger screens from a WidgetRef context (AI-02).
void refreshLedgerViewsFromWidget(WidgetRef ref) {
  ref.invalidate(monthSummaryProvider);
  ref.invalidate(recentEntriesProvider);
  ref.invalidate(allEntriesProvider);
  ref.invalidate(walletsProvider);
  ref.invalidate(monthStatsProvider);
  ref.invalidate(coachOverviewProvider);
}
