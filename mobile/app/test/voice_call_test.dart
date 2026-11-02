import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ai/voice/voice_call_controller.dart';
import 'package:smartspend_app/src/features/ai/voice/voice_call_models.dart';
import 'package:smartspend_app/src/features/ai/voice/voice_call_screen.dart';

void main() {
  group('VoiceCallController Protocol v2 State Machine', () {
    test('starts call and sends v2 hello payload', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final fakeSocket = FakeVoiceSocketClient();
      final controller = container.read(voiceCallControllerProvider.notifier);

      expect(
        container.read(voiceCallControllerProvider).status,
        VoiceCallStatus.idle,
      );

      await controller.start(
        ticket: 'test-ticket-xyz',
        socketOverride: fakeSocket,
      );

      expect(
        container.read(voiceCallControllerProvider).status,
        VoiceCallStatus.connecting,
      );
      expect(fakeSocket.sentMessages.length, 1);

      final hello =
          jsonDecode(fakeSocket.sentMessages.first) as Map<String, Object?>;
      expect(hello['type'], 'hello');
      expect(hello['v'], 2);
      expect(hello['ticket'], 'test-ticket-xyz');
      expect(hello['client'], 'android');
    });

    test(
      'transitions through ready, state, transcript and card events',
      () async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        final fakeSocket = FakeVoiceSocketClient();
        final controller = container.read(voiceCallControllerProvider.notifier);

        await controller.start(ticket: 'ticket-1', socketOverride: fakeSocket);

        // Server sends ready
        fakeSocket.receiveServerMessage({
          'type': 'ready',
          'callId': 'call-100',
        });
        await Future<void>.delayed(Duration.zero);

        var state = container.read(voiceCallControllerProvider);
        expect(state.status, VoiceCallStatus.listening);
        expect(state.callId, 'call-100');

        // Server sends state change to thinking
        fakeSocket.receiveServerMessage({
          'type': 'state',
          'state': 'thinking',
          'wait': 'جاري البحث في مصاريف الشهر...',
        });
        await Future<void>.delayed(Duration.zero);

        state = container.read(voiceCallControllerProvider);
        expect(state.status, VoiceCallStatus.thinking);
        expect(state.waitDetail, 'جاري البحث في مصاريف الشهر...');

        // Server sends assistant transcript
        fakeSocket.receiveServerMessage({
          'type': 'transcript',
          'text': 'صرفت 450 جنيه في المطاعم الأسبوع ده.',
        });
        await Future<void>.delayed(Duration.zero);

        state = container.read(voiceCallControllerProvider);
        expect(
          state.assistantTranscript,
          'صرفت 450 جنيه في المطاعم الأسبوع ده.',
        );

        // Server pushes an action card
        fakeSocket.receiveServerMessage({
          'type': 'card',
          'card': {
            'kind': 'draft',
            'id': 'draft-food-1',
            'title': 'إضافة مصروف غداء',
            'total': 150.0,
            'message': 'مطعم البرنس',
            'status': 'pending',
          },
        });
        await Future<void>.delayed(Duration.zero);

        state = container.read(voiceCallControllerProvider);
        expect(state.cards.length, 1);
        expect(state.cards.first.id, 'draft-food-1');
        expect(state.cards.first.total, 150.0);
        expect(state.cards.first.status, 'pending');

        // Confirm card
        controller.confirmCard('draft-food-1');
        expect(
          fakeSocket.sentMessages.any(
            (m) => m.contains('"type":"confirm"') && m.contains('draft-food-1'),
          ),
          isTrue,
        );
        state = container.read(voiceCallControllerProvider);
        expect(state.cards.first.status, 'executing');

        // End call
        controller.endCall();
        expect(
          container.read(voiceCallControllerProvider).status,
          VoiceCallStatus.ended,
        );
        expect(fakeSocket.isClosed, isTrue);
      },
    );

    test('toggles mute and speaker states correctly', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final controller = container.read(voiceCallControllerProvider.notifier);

      expect(container.read(voiceCallControllerProvider).isMuted, isFalse);
      controller.toggleMute();
      expect(container.read(voiceCallControllerProvider).isMuted, isTrue);
      controller.toggleMute();
      expect(container.read(voiceCallControllerProvider).isMuted, isFalse);

      expect(container.read(voiceCallControllerProvider).isSpeakerOn, isTrue);
      controller.toggleSpeaker();
      expect(container.read(voiceCallControllerProvider).isSpeakerOn, isFalse);
      controller.toggleSpeaker();
      expect(container.read(voiceCallControllerProvider).isSpeakerOn, isTrue);
    });
  });

  group('VoiceCallScreen Widget Tests', () {
    testWidgets('renders visualizer, transcript and controls', (tester) async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final fakeSocket = FakeVoiceSocketClient();
      final controller = container.read(voiceCallControllerProvider.notifier);
      await controller.start(ticket: 'test-ticket', socketOverride: fakeSocket);

      fakeSocket.receiveServerMessage({'type': 'ready', 'callId': 'call-test'});
      fakeSocket.receiveServerMessage({
        'type': 'transcript',
        'text': 'مرحباً، كيف أساعدك اليوم؟',
      });
      fakeSocket.receiveServerMessage({
        'type': 'card',
        'card': {
          'kind': 'draft',
          'id': 'card-1',
          'title': 'إضافة مصروف',
          'total': 85.0,
          'message': 'قهوة وشاي',
          'status': 'pending',
        },
      });

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            locale: Locale('ar'),
            home: VoiceCallScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('مكالمة ذكية مباشرة'), findsOneWidget);
      expect(find.text('مرحباً، كيف أساعدك اليوم؟'), findsOneWidget);
      expect(find.text('إضافة مصروف'), findsOneWidget);
      expect(find.textContaining('85'), findsOneWidget);
      expect(find.text('قهوة وشاي'), findsOneWidget);

      // Tap confirm button
      await tester.tap(find.byIcon(Icons.check_circle));
      await tester.pumpAndSettle();

      expect(
        fakeSocket.sentMessages.any((m) => m.contains('"type":"confirm"')),
        isTrue,
      );
      expect(find.text('تم التنفيذ'), findsOneWidget);

      // Tap end call button
      await tester.tap(find.byIcon(Icons.call_end));
      await tester.pumpAndSettle();

      expect(
        container.read(voiceCallControllerProvider).status,
        VoiceCallStatus.ended,
      );
    });
  });
}
