import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Result of an audio recording session (REC-05).
class RecordingResult {
  const RecordingResult({
    required this.audioBase64,
    this.mimeType = 'audio/mp4',
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

  Future<void> dispose();
}

/// The phone's microphone, recording compressed mono audio to a temporary file that is deleted once read: no
/// recording stays on the phone (owner decision: no transcripts or voice are stored).
class DeviceAudioRecorderService implements AudioRecorderService {
  final _recorder = AudioRecorder();
  String? _path;
  DateTime? _startedAt;
  bool _recording = false;

  @override
  bool get isRecording => _recording;

  /// `dBFS` runs from about -60 (silence) to 0 (loud).
  @override
  Stream<double> get amplitudeStream => _recorder
      .onAmplitudeChanged(const Duration(milliseconds: 100))
      .map((level) => ((level.current + 60) / 60).clamp(0.0, 1.0));

  @override
  Future<bool> hasPermission() => _recorder.hasPermission(request: false);

  @override
  Future<bool> requestPermission() => _recorder.hasPermission();

  @override
  Future<void> startRecording() async {
    final folder = await getTemporaryDirectory();
    final path =
        '${folder.path}/voice_${DateTime.now().microsecondsSinceEpoch}.m4a';
    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        bitRate: 48000,
        sampleRate: 16000,
        numChannels: 1,
      ),
      path: path,
    );
    _path = path;
    _startedAt = DateTime.now();
    _recording = true;
  }

  @override
  Future<RecordingResult?> stopRecording() async {
    if (!_recording) return null;
    _recording = false;
    final path = await _recorder.stop() ?? _path;
    if (path == null) return null;
    final file = File(path);
    if (!file.existsSync()) return null;
    final bytes = await file.readAsBytes();
    await file.delete();
    if (bytes.isEmpty) return null;
    return RecordingResult(
      audioBase64: base64Encode(bytes),
      mimeType: 'audio/mp4',
      durationSeconds: DateTime.now().difference(_startedAt!).inSeconds,
    );
  }

  @override
  Future<void> cancelRecording() async {
    _recording = false;
    await _recorder.cancel();
  }

  @override
  Future<void> dispose() => _recorder.dispose();
}
