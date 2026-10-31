import 'dart:async';

/// Result of an audio recording session (REC-05).
class RecordingResult {
  const RecordingResult({
    required this.audioBase64,
    this.mimeType = 'audio/m4a',
    this.durationSeconds = 0,
  });

  /// Base64-encoded audio payload (clean or data URI).
  final String audioBase64;

  /// MIME type supported by `ai.parseVoiceExpense` (e.g. `audio/m4a`, `audio/webm`, `audio/aac`).
  final String mimeType;

  /// Duration recorded in seconds.
  final int durationSeconds;
}

/// Abstract contract for recording voice entries.
/// Decouples UI from native platform audio libraries (Rule 12.2 / REC-05).
abstract interface class AudioRecorderService {
  /// Whether microphone permission has already been granted.
  Future<bool> hasPermission();

  /// Requests microphone permission from the operating system.
  Future<bool> requestPermission();

  /// Starts recording audio.
  Future<void> startRecording();

  /// Stops recording and returns the captured audio payload, or null if cancelled or empty.
  Future<RecordingResult?> stopRecording();

  /// Cancels and discards the active recording session.
  Future<void> cancelRecording();

  /// Stream of normalized amplitude levels between 0.0 (silence) and 1.0 (loud).
  Stream<double> get amplitudeStream;

  /// Whether a recording is currently in progress.
  bool get isRecording;
}

/// In-memory fake implementation of [AudioRecorderService] for unit/widget tests and headless runs.
class FakeAudioRecorderService implements AudioRecorderService {
  FakeAudioRecorderService({
    bool hasPermissionByDefault = true,
    this.permissionGrantedOnRequest = true,
    this.mockBase64 = 'AAAA',
    this.mockDurationSeconds = 3,
  }) : _hasPermission = hasPermissionByDefault;

  bool _hasPermission;
  final bool permissionGrantedOnRequest;
  final String mockBase64;
  final int mockDurationSeconds;

  bool _recording = false;
  final _amplitudeController = StreamController<double>.broadcast();

  @override
  bool get isRecording => _recording;

  @override
  Stream<double> get amplitudeStream => _amplitudeController.stream;

  @override
  Future<bool> hasPermission() async => _hasPermission;

  @override
  Future<bool> requestPermission() async {
    _hasPermission = permissionGrantedOnRequest;
    return _hasPermission;
  }

  @override
  Future<void> startRecording() async {
    _recording = true;
    _amplitudeController.add(0.4);
  }

  /// Helper for tests to simulate voice fluctuations.
  void emitAmplitude(double amp) {
    if (_recording) {
      _amplitudeController.add(amp);
    }
  }

  @override
  Future<RecordingResult?> stopRecording() async {
    if (!_recording) return null;
    _recording = false;
    _amplitudeController.add(0.0);
    return RecordingResult(
      audioBase64: mockBase64,
      mimeType: 'audio/m4a',
      durationSeconds: mockDurationSeconds,
    );
  }

  @override
  Future<void> cancelRecording() async {
    _recording = false;
    _amplitudeController.add(0.0);
  }

  void dispose() {
    _amplitudeController.close();
  }
}
