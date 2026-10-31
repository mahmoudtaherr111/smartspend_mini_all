import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'audio_recorder_service.dart';

/// Provides the active [AudioRecorderService] instance.
final audioRecorderServiceProvider = Provider<AudioRecorderService>((ref) {
  final service = FakeAudioRecorderService();
  ref.onDispose(service.dispose);
  return service;
});

class TapToRecordNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
  void setMode(bool value) => state = value;
}

/// Whether the user toggled tap-to-record mode instead of hold-to-record (Accessibility Rule 12.2).
final tapToRecordModeProvider = NotifierProvider<TapToRecordNotifier, bool>(
  TapToRecordNotifier.new,
);
