import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

    final durationMin = (state.durationSeconds ~/ 60).toString().padLeft(2, '0');
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
          state.status == VoiceCallStatus.ended ? 'انتهت المكالمة' : 'مكالمة ذكية مباشرة',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 12),
            // Call duration counter
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(20),
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
            const SizedBox(height: 24),

            // Visualizer & status indicator
            Expanded(
              flex: 3,
              child: Center(
                child: _CallVisualizer(status: state.status),
              ),
            ),

            // Live Assistant Transcript / Status message
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                child: Text(
                  state.assistantTranscript.isNotEmpty
                      ? state.assistantTranscript
                      : _statusText(state.status, state.waitDetail),
                  key: ValueKey(state.assistantTranscript + state.status.name),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 16,
                    height: 1.5,
                  ),
                ),
              ),
            ),

            if (state.errorMessage != null) ...[
              const SizedBox(height: 12),
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 24),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                ),
                child: Text(
                  state.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                ),
              ),
            ],

            const Spacer(),

            // In-call action cards (AI-02 within AI-09)
            if (state.cards.isNotEmpty)
              Container(
                constraints: const BoxConstraints(maxHeight: 180),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: state.cards.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 8),
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

            const SizedBox(height: 16),

            // Privacy disclaimer
            Text(
              '🔒 المكالمة مشفرة، ولا يتم تسجيل أو حفظ الصوت بعد انتهائها.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.4),
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 20),

            // In-call control buttons (AI-09)
            _CallControlsBar(
              state: state,
              controller: controller,
              onEnd: () {
                controller.endCall();
                Navigator.of(context).maybePop();
              },
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  String _statusText(VoiceCallStatus status, String? waitDetail) {
    switch (status) {
      case VoiceCallStatus.idle:
        return 'جاهز للبدء';
      case VoiceCallStatus.connecting:
        return 'جاري الاتصال بالخادم...';
      case VoiceCallStatus.listening:
        return 'نسمعك الآن، تحدث بحرية...';
      case VoiceCallStatus.thinking:
        return waitDetail != null && waitDetail.isNotEmpty
            ? waitDetail
            : 'جاري التفكير وتحليل الحسابات...';
      case VoiceCallStatus.speaking:
        return 'المساعد الذكي يتحدث...';
      case VoiceCallStatus.awaitingConfirmation:
        return 'يرجى تأكيد العملية المقترحة';
      case VoiceCallStatus.reconnecting:
        return 'جاري إعادة الاتصال...';
      case VoiceCallStatus.ended:
        return 'انتهت المكالمة';
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
          width: status == VoiceCallStatus.speaking || status == VoiceCallStatus.listening ? 180 : 140,
          height: status == VoiceCallStatus.speaking || status == VoiceCallStatus.listening ? 180 : 140,
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
          child: Icon(
            centerIcon,
            color: Colors.white,
            size: 40,
          ),
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
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
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                if (card.message != null && card.message!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    card.message!,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 12,
                    ),
                  ),
                ],
                if (card.total != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${card.total} ج.م',
                    style: const TextStyle(
                      color: Color(0xFF34D399),
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (isPending) ...[
            IconButton(
              icon: const Icon(Icons.close, color: Colors.redAccent),
              tooltip: 'إلغاء',
              onPressed: onCancel,
            ),
            IconButton(
              icon: const Icon(Icons.check_circle, color: Color(0xFF34D399)),
              tooltip: 'تأكيد',
              onPressed: onConfirm,
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white10,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                card.status == 'executed' || card.status == 'executing'
                    ? 'تم التنفيذ'
                    : card.status == 'cancelled'
                        ? 'ملغاة'
                        : card.status,
                style: const TextStyle(color: Colors.white70, fontSize: 12),
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
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Mute toggle button
          IconButton.filledTonal(
            iconSize: 28,
            style: IconButton.styleFrom(
              backgroundColor: state.isMuted ? Colors.red.withValues(alpha: 0.2) : Colors.white10,
              foregroundColor: state.isMuted ? Colors.redAccent : Colors.white,
              padding: const EdgeInsets.all(16),
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
              padding: const EdgeInsets.all(18),
            ),
            icon: const Icon(Icons.call_end),
            onPressed: onEnd,
          ),

          // Speakerphone toggle button
          IconButton.filledTonal(
            iconSize: 28,
            style: IconButton.styleFrom(
              backgroundColor: state.isSpeakerOn ? Colors.blue.withValues(alpha: 0.2) : Colors.white10,
              foregroundColor: state.isSpeakerOn ? const Color(0xFF38BDF8) : Colors.white,
              padding: const EdgeInsets.all(16),
            ),
            icon: Icon(state.isSpeakerOn ? Icons.volume_up : Icons.volume_down),
            onPressed: controller.toggleSpeaker,
          ),
        ],
      ),
    );
  }
}
