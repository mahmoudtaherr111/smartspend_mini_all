import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../../l10n/app_localizations.dart';

import 'voice_call_controller.dart';
import 'voice_call_models.dart';

/// Screen representing the live voice call session (AI-09, GAP-06).
///
/// NOTE on GAP-06 (Audio session / Android foreground service):
/// On physical Android devices, continuous microphone capture and live WebSocket streaming
/// require an ongoing Foreground Service with microphone notification to prevent the OS from
/// suspending the background isolate when the screen turns off.
class VoiceCallScreen extends ConsumerWidget {
  const VoiceCallScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(voiceCallControllerProvider);
    final controller = ref.read(voiceCallControllerProvider.notifier);

    final durationMin = (state.durationSeconds ~/ 60).toString().padLeft(
      2,
      '0',
    );
    final durationSec = (state.durationSeconds % 60).toString().padLeft(2, '0');

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A), // Dark slate navy
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.white70),
          onPressed: () {
            if (state.status != VoiceCallStatus.ended) {
              controller.endCall();
            }
            Navigator.of(context).maybePop();
          },
        ),
        title: Text(
          state.status == VoiceCallStatus.ended
              ? AppLocalizations.of(context).aiCallEnded
              : AppLocalizations.of(context).aiLiveCall2,
          style: Theme.of(context).textTheme.titleLarge
              ?.copyWith(color: Colors.white),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: SmartSpendSpacing.md),
            // Call duration counter
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.lg,
                vertical: SmartSpendSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
              ),
              child: Text(
                '$durationMin:$durationSec',
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'monospace',
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),

            // Visualizer & status indicator
            Expanded(
              flex: 3,
              child: Center(child: _CallVisualizer(status: state.status)),
            ),

            // Live Assistant Transcript / Status message
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.xl,
              ),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                child: Text(
                  state.assistantTranscript.isNotEmpty
                      ? state.assistantTranscript
                      : _statusText(context, state.status, state.waitDetail),
                  key: ValueKey(state.assistantTranscript + state.status.name),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge
                      ?.copyWith(color: Colors.white.withValues(alpha: 0.9)),
                ),
              ),
            ),

            if (state.errorMessage != null) ...[
              const SizedBox(height: SmartSpendSpacing.md),
              Container(
                margin: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.xl,
                ),
                padding: const EdgeInsets.all(SmartSpendSpacing.md),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                ),
                child: Text(
                  state.errorMessage!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(color: Colors.redAccent),
                ),
              ),
            ],

            const Spacer(),

            // In-call action cards (AI-02 within AI-09)
            if (state.cards.isNotEmpty)
              Container(
                constraints: const BoxConstraints(maxHeight: 180),
                padding: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.lg,
                ),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: state.cards.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: SmartSpendSpacing.sm),
                  itemBuilder: (context, index) {
                    final card = state.cards[index];
                    return _LiveCallCardWidget(
                      card: card,
                      onConfirm: () => controller.confirmCard(card.id),
                      onCancel: () => controller.cancelCard(card.id),
                    );
                  },
                ),
              ),

            const SizedBox(height: SmartSpendSpacing.lg),

            // Privacy disclaimer
            Text(
              AppLocalizations.of(context).aiTheAudioIsNotRecorded,
              style: Theme.of(context).textTheme.labelSmall
                  ?.copyWith(color: Colors.white.withValues(alpha: 0.4)),
            ),
            const SizedBox(height: SmartSpendSpacing.screen),

            // In-call control buttons (AI-09)
            _CallControlsBar(
              state: state,
              controller: controller,
              onEnd: () {
                controller.endCall();
                Navigator.of(context).maybePop();
              },
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
          ],
        ),
      ),
    );
  }

  String _statusText(
    BuildContext context,
    VoiceCallStatus status,
    String? waitDetail,
  ) {
    switch (status) {
      case VoiceCallStatus.idle:
        return AppLocalizations.of(context).aiReady;
      case VoiceCallStatus.connecting:
        return AppLocalizations.of(context).aiConnecting;
      case VoiceCallStatus.listening:
        return AppLocalizations.of(context).aiListeningGoAhead;
      case VoiceCallStatus.thinking:
        return waitDetail != null && waitDetail.isNotEmpty
            ? waitDetail
            : AppLocalizations.of(context).aiThinking2;
      case VoiceCallStatus.speaking:
        return AppLocalizations.of(context).aiTheAssistantIsSpeaking;
      case VoiceCallStatus.awaitingConfirmation:
        return AppLocalizations.of(context).aiPleaseConfirmTheSuggestedAction;
      case VoiceCallStatus.reconnecting:
        return AppLocalizations.of(context).aiReconnecting;
      case VoiceCallStatus.ended:
        return AppLocalizations.of(context).aiCallEnded;
    }
  }
}

class _CallVisualizer extends StatelessWidget {
  final VoiceCallStatus status;

  const _CallVisualizer({required this.status});

  @override
  Widget build(BuildContext context) {
    Color glowColor;
    IconData centerIcon;

    switch (status) {
      case VoiceCallStatus.connecting:
      case VoiceCallStatus.reconnecting:
        glowColor = Colors.blueGrey;
        centerIcon = Icons.sync;
        break;
      case VoiceCallStatus.listening:
        glowColor = const Color(0xFF10B981); // Emerald
        centerIcon = Icons.mic;
        break;
      case VoiceCallStatus.thinking:
        glowColor = const Color(0xFFF59E0B); // Amber
        centerIcon = Icons.auto_awesome;
        break;
      case VoiceCallStatus.speaking:
        glowColor = const Color(0xFF8B5CF6); // Purple
        centerIcon = Icons.volume_up;
        break;
      case VoiceCallStatus.awaitingConfirmation:
        glowColor = const Color(0xFFEC4899); // Pink
        centerIcon = Icons.touch_app;
        break;
      case VoiceCallStatus.idle:
      case VoiceCallStatus.ended:
        glowColor = Colors.grey;
        centerIcon = Icons.call_end;
        break;
    }

    return Stack(
      alignment: Alignment.center,
      children: [
        // Outer glow circle
        AnimatedContainer(
          duration: const Duration(milliseconds: 400),
          width:
              status == VoiceCallStatus.speaking ||
                  status == VoiceCallStatus.listening
              ? 180
              : 140,
          height:
              status == VoiceCallStatus.speaking ||
                  status == VoiceCallStatus.listening
              ? 180
              : 140,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: glowColor.withValues(alpha: 0.15),
          ),
        ),
        // Middle pulse ring
        AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          width: status == VoiceCallStatus.speaking ? 140 : 110,
          height: status == VoiceCallStatus.speaking ? 140 : 110,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: glowColor.withValues(alpha: 0.25),
          ),
        ),
        // Core icon circle
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: glowColor,
            boxShadow: [
              BoxShadow(
                color: glowColor.withValues(alpha: 0.5),
                blurRadius: 20,
                spreadRadius: 4,
              ),
            ],
          ),
          child: Icon(centerIcon, color: Colors.white, size: 40),
        ),
      ],
    );
  }
}

class _LiveCallCardWidget extends StatelessWidget {
  final LiveCallCard card;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  const _LiveCallCardWidget({
    required this.card,
    required this.onConfirm,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final isPending = card.status == 'pending';

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.md),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        border: Border.all(
          color: isPending ? const Color(0xFF38BDF8) : Colors.white12,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  card.title,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(color: Colors.white),
                ),
                if (card.message != null && card.message!.isNotEmpty) ...[
                  const SizedBox(height: SmartSpendSpacing.xs / 2),
                  Text(
                    card.message!,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: Colors.white.withValues(alpha: 0.7)),
                  ),
                ],
                if (card.total != null) ...[
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    moneyText(context, card.total!),
                    style: Theme.of(context).textTheme.titleSmall
                        ?.copyWith(color: Color(0xFF34D399)),
                  ),
                ],
              ],
            ),
          ),
          if (isPending) ...[
            IconButton(
              icon: const Icon(Icons.close, color: Colors.redAccent),
              tooltip: AppLocalizations.of(context).aiCancel,
              onPressed: onCancel,
            ),
            IconButton(
              icon: const Icon(Icons.check_circle, color: Color(0xFF34D399)),
              tooltip: AppLocalizations.of(context).aiConfirm2,
              onPressed: onConfirm,
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.md,
                vertical: SmartSpendSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: Colors.white10,
                borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
              ),
              child: Text(
                card.status == 'executed' || card.status == 'executing'
                    ? AppLocalizations.of(context).aiDone2
                    : card.status == 'cancelled'
                    ? AppLocalizations.of(context).aiCancelled2
                    : card.status,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: Colors.white70),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CallControlsBar extends StatelessWidget {
  final LiveCallState state;
  final VoiceCallController controller;
  final VoidCallback onEnd;

  const _CallControlsBar({
    required this.state,
    required this.controller,
    required this.onEnd,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.xxl),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Mute toggle button
          IconButton.filledTonal(
            iconSize: 28,
            style: IconButton.styleFrom(
              backgroundColor: state.isMuted
                  ? Colors.red.withValues(alpha: 0.2)
                  : Colors.white10,
              foregroundColor: state.isMuted ? Colors.redAccent : Colors.white,
              padding: const EdgeInsets.all(SmartSpendSpacing.lg),
            ),
            icon: Icon(state.isMuted ? Icons.mic_off : Icons.mic),
            onPressed: controller.toggleMute,
          ),

          // End call button (red)
          IconButton.filled(
            iconSize: 32,
            style: IconButton.styleFrom(
              backgroundColor: Colors.redAccent,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.all(SmartSpendSpacing.lg),
            ),
            icon: const Icon(Icons.call_end),
            onPressed: onEnd,
          ),

          // Speakerphone toggle button
          IconButton.filledTonal(
            iconSize: 28,
            style: IconButton.styleFrom(
              backgroundColor: state.isSpeakerOn
                  ? Colors.blue.withValues(alpha: 0.2)
                  : Colors.white10,
              foregroundColor: state.isSpeakerOn
                  ? const Color(0xFF38BDF8)
                  : Colors.white,
              padding: const EdgeInsets.all(SmartSpendSpacing.lg),
            ),
            icon: Icon(state.isSpeakerOn ? Icons.volume_up : Icons.volume_down),
            onPressed: controller.toggleSpeaker,
          ),
        ],
      ),
    );
  }
}
