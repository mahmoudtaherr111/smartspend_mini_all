import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';

import 'ai_chat_view.dart';
import 'ai_compare_view.dart';
import 'ai_conversations_sheet.dart';
import 'ai_memories_sheet.dart';
import 'ai_providers.dart';
import 'ai_report_view.dart';
import 'ai_yearly_insights_view.dart';
import 'voice/past_calls_view.dart';
import 'voice/voice_call_controller.dart';
import 'voice/voice_call_screen.dart';

/// The central container screen for all AI features in SmartSpend AI (AI-01 through AI-11).
/// Off until the call has real microphone and speaker audio: a person never sees a call that cannot talk.
const liveCallsEnabled = false;

class AiCenterScreen extends ConsumerStatefulWidget {
  const AiCenterScreen({super.key});

  @override
  ConsumerState<AiCenterScreen> createState() => _AiCenterScreenState();
}

class _AiCenterScreenState extends ConsumerState<AiCenterScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: liveCallsEnabled ? 5 : 4,
      vsync: this,
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _startVoiceCall() async {
    final scaffoldMessenger = ScaffoldMessenger.of(context);

    try {
      final eligibility = await ref.read(voiceEligibilityProvider.future);
      if (!mounted) return;

      if (!eligibility.eligible) {
        await showDialog<void>(
          context: context,
          builder: (dialogCtx) => AlertDialog(
            title: Text(AppLocalizations.of(context).aiLiveCall),
            content: Text(
              eligibility.reason ??
                  AppLocalizations.of(context).aiTheLiveCallComesWith,
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogCtx).pop(),
                child: Text(AppLocalizations.of(context).aiCancel),
              ),
              FilledButton(
                onPressed: () {
                  Navigator.of(dialogCtx).pop();
                  context.push('/more/plan');
                },
                child: Text(AppLocalizations.of(context).aiUpgrade),
              ),
            ],
          ),
        );
        return;
      }

      // Show confirmation & preparation sheet before connecting
      final confirmed = await showModalBottomSheet<bool>(
        context: context,
        builder: (sheetCtx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(sheetCtx).colorScheme.primaryContainer
                        .withValues(alpha: 0.4),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.phone_in_talk,
                    size: 40,
                    color: Theme.of(sheetCtx).colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  AppLocalizations.of(context).aiStartALiveCall,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  AppLocalizations.of(context).aiWeLlUseTheMicrophone,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: Theme.of(sheetCtx).colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(sheetCtx).pop(false),
                        child: Text(AppLocalizations.of(context).aiCancel),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => Navigator.of(sheetCtx).pop(true),
                        icon: const Icon(Icons.call),
                        label: Text(AppLocalizations.of(context).aiCall),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );

      if (confirmed != true || !mounted) return;

      // Start call session on server
      final callSession = await ref.read(aiApiProvider).startVoiceCall();
      final ticket = callSession['ticket'] as String? ?? 'dev-ticket';

      if (!mounted) return;

      // Initialize voice controller and navigate to call screen
      await ref
          .read(voiceCallControllerProvider.notifier)
          .start(ticket: ticket);
      if (!mounted) return;

      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const VoiceCallScreen(),
          fullscreenDialog: true,
        ),
      );
    } catch (e) {
      scaffoldMessenger.showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).aiWeCouldnTStartThe),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          AppLocalizations.of(context).aiAiCenter,
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          // Live Voice Call button (AI-09)
          if (liveCallsEnabled)
            IconButton(
              icon: const Icon(Icons.phone_in_talk_outlined),
              tooltip: AppLocalizations.of(context).aiLiveCall2,
              onPressed: _startVoiceCall,
            ),
          // Long-term Memories list (AI-05)
          IconButton(
            icon: const Icon(Icons.psychology_outlined),
            tooltip: AppLocalizations.of(context).aiWhatTheAssistantRemembers,
            onPressed: () => AiMemoriesSheet.show(context),
          ),
          // Conversation threads (AI-03)
          IconButton(
            icon: const Icon(Icons.forum_outlined),
            tooltip: AppLocalizations.of(context).aiPastConversations,
            onPressed: () => AiConversationsSheet.show(context),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: AppLocalizations.of(context).aiChat),
            Tab(text: AppLocalizations.of(context).aiMonthlyReport),
            Tab(text: AppLocalizations.of(context).aiCompareMonths),
            if (liveCallsEnabled)
              Tab(text: AppLocalizations.of(context).aiCalls),
            Tab(text: AppLocalizations.of(context).aiYearlyReport),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // 1. Interactive Chat (AI-01, AI-02, AI-04)
          const AiChatView(),

          // 2. Monthly Financial Report (AI-06, AI-08)
          const AiReportView(),

          // 3. Month-over-Month Comparison (AI-07)
          const AiCompareView(),

          // 4. Past Voice Calls History (AI-10)
          if (liveCallsEnabled) PastCallsView(onStartNewCall: _startVoiceCall),

          // 5. Yearly Insights (AI-11)
          const AiYearlyInsightsView(),
        ],
      ),
    );
  }
}
