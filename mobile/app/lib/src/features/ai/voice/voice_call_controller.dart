import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform, WebSocket;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import 'voice_call_models.dart';

/// Abstract socket interface allowing mock sockets in tests and real WebSockets in production.
abstract class VoiceSocketClient {
  Stream<dynamic> get messages;
  void send(String message);
  void close();
}

/// Real WebSocket implementation for production live voice calls.
class IoVoiceSocketClient implements VoiceSocketClient {
  IoVoiceSocketClient(this._socket);
  final WebSocket _socket;

  @override
  Stream<dynamic> get messages => _socket;

  @override
  void send(String message) {
    _socket.add(message);
  }

  @override
  void close() {
    _socket.close();
  }
}

/// Fake socket client harness for testing the protocol end-to-end without physical hardware.
class FakeVoiceSocketClient implements VoiceSocketClient {
  final _controller = StreamController<dynamic>.broadcast();
  final List<String> sentMessages = [];
  bool isClosed = false;

  @override
  Stream<dynamic> get messages => _controller.stream;

  @override
  void send(String message) {
    sentMessages.add(message);
  }

  void receiveServerMessage(Map<String, Object?> message) {
    if (!isClosed) {
      _controller.add(jsonEncode(message));
    }
  }

  @override
  void close() {
    isClosed = true;
    _controller.close();
  }
}

/// Controller managing the live voice call state machine and protocol v2 (AI-09, GAP-06).
class VoiceCallController extends Notifier<LiveCallState> {
  VoiceSocketClient? _socket;
  Timer? _durationTimer;
  Timer? _pingTimer;
  StreamSubscription<dynamic>? _subscription;

  @override
  LiveCallState build() => const LiveCallState();

  /// Starts the call session with a single-use ticket from `voice.startCall`.
  Future<void> start({
    required String ticket,
    VoiceSocketClient? socketOverride,
  }) async {
    state = state.copyWith(status: VoiceCallStatus.connecting);

    if (socketOverride != null) {
      _socket = socketOverride;
    } else {
      try {
        final apiUri = ref.read(appConfigProvider).apiBaseUri;
        final isSecure = apiUri.scheme == 'https';
        final wsUri = apiUri.replace(
          scheme: isSecure ? 'wss' : 'ws',
          path: '/api/voice/v2',
        );
        final ws = await WebSocket.connect(wsUri.toString());
        _socket = IoVoiceSocketClient(ws);
      } catch (e) {
        state = state.copyWith(
          status: VoiceCallStatus.ended,
          errorMessage: 'ما عرفناش نوصل المكالمة.',
        );
        return;
      }
    }

    _setupSocketListener();
    _startPingTimer();

    final clientPlatform = Platform.isIOS ? 'ios' : 'android';
    _socket?.send(
      jsonEncode({
        'type': 'hello',
        'v': 2,
        'ticket': ticket,
        'codecs': ['pcm16'],
        'client': clientPlatform,
      }),
    );
  }

  void _setupSocketListener() {
    _subscription?.cancel();
    _subscription = _socket?.messages.listen(
      (event) {
        if (event is String) {
          try {
            final json = jsonDecode(event) as Map<String, Object?>;
            _handleServerMessage(json);
          } catch (_) {}
        }
      },
      onDone: () {
        if (state.status != VoiceCallStatus.ended) {
          endCall();
        }
      },
      onError: (err) {
        state = state.copyWith(
          status: VoiceCallStatus.ended,
          errorMessage: 'الاتصال انقطع.',
        );
      },
    );
  }

  void _handleServerMessage(Map<String, Object?> message) {
    final type = message['type'] as String?;
    switch (type) {
      case 'ready':
        final callId = message['callId'] as String?;
        state = state.copyWith(
          status: VoiceCallStatus.listening,
          callId: callId,
        );
        _startTimer();
      case 'state':
        final rawState = message['state'] as String?;
        final wait = message['wait'] as String?;
        final status = switch (rawState) {
          'listening' => VoiceCallStatus.listening,
          'thinking' => VoiceCallStatus.thinking,
          'speaking' => VoiceCallStatus.speaking,
          'awaiting_confirmation' => VoiceCallStatus.awaitingConfirmation,
          'reconnecting' => VoiceCallStatus.reconnecting,
          _ => state.status,
        };
        state = state.copyWith(status: status, waitDetail: wait);
      case 'transcript':
        final text = (message['text'] as String?) ?? '';
        state = state.copyWith(assistantTranscript: text);
      case 'card':
        final cardData = message['card'] as Map<String, Object?>?;
        if (cardData != null) {
          final newCard = LiveCallCard.fromJson(cardData);
          final updatedCards = [...state.cards];
          final existingIndex = updatedCards.indexWhere(
            (c) => c.id == newCard.id,
          );
          if (existingIndex >= 0) {
            updatedCards[existingIndex] = newCard;
          } else {
            updatedCards.add(newCard);
          }
          state = state.copyWith(cards: updatedCards);
        }
      case 'error':
        final errorMsg =
            (message['message'] as String?) ?? 'حصلت مشكلة في المكالمة';
        state = state.copyWith(errorMessage: errorMsg);
      case 'ended':
      case 'end':
        endCall();
    }
  }

  void _startTimer() {
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      state = state.copyWith(durationSeconds: state.durationSeconds + 1);
    });
  }

  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      try {
        _socket?.send(
          jsonEncode({
            'type': 'ping',
            't': DateTime.now().millisecondsSinceEpoch,
          }),
        );
      } catch (_) {}
    });
  }

  /// Explicitly confirms a draft action card during the call.
  void confirmCard(String draftId) {
    _socket?.send(jsonEncode({'type': 'confirm', 'draftId': draftId}));
    final updated = state.cards.map((c) {
      if (c.id == draftId) return c.copyWith(status: 'executing');
      return c;
    }).toList();
    state = state.copyWith(cards: updated);
  }

  /// Cancels a draft action card during the call.
  void cancelCard(String draftId) {
    _socket?.send(jsonEncode({'type': 'cancel', 'draftId': draftId}));
    final updated = state.cards.map((c) {
      if (c.id == draftId) return c.copyWith(status: 'cancelled');
      return c;
    }).toList();
    state = state.copyWith(cards: updated);
  }

  void toggleMute() {
    state = state.copyWith(isMuted: !state.isMuted);
  }

  void toggleSpeaker() {
    state = state.copyWith(isSpeakerOn: !state.isSpeakerOn);
  }

  /// Closes the socket and ends the active call session cleanly.
  void endCall() {
    _durationTimer?.cancel();
    _durationTimer = null;
    _pingTimer?.cancel();
    _pingTimer = null;
    try {
      _socket?.send(jsonEncode({'type': 'end'}));
    } catch (_) {}
    _socket?.close();
    _socket = null;
    _subscription?.cancel();
    _subscription = null;

    state = state.copyWith(status: VoiceCallStatus.ended);
  }
}

final voiceCallControllerProvider =
    NotifierProvider<VoiceCallController, LiveCallState>(
      VoiceCallController.new,
    );
