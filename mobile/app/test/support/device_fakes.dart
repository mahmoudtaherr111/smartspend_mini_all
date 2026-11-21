import 'dart:async';

import 'package:smartspend_app/src/features/ledger/receipts/receipt_image_service.dart';
import 'package:smartspend_app/src/features/ledger/voice/audio_recorder_service.dart';

/// A microphone for tests: it records nothing and answers what the test set.
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
  final _amplitude = StreamController<double>.broadcast();

  @override
  bool get isRecording => _recording;

  @override
  Stream<double> get amplitudeStream => _amplitude.stream;

  @override
  Future<bool> hasPermission() async => _hasPermission;

  @override
  Future<bool> requestPermission() async {
    _hasPermission = permissionGrantedOnRequest;
    return _hasPermission;
  }

  @override
  Future<void> startRecording() async => _recording = true;

  void emitAmplitude(double value) => _amplitude.add(value);

  @override
  Future<RecordingResult?> stopRecording() async {
    if (!_recording) return null;
    _recording = false;
    return RecordingResult(
      audioBase64: mockBase64,
      durationSeconds: mockDurationSeconds,
    );
  }

  @override
  Future<void> cancelRecording() async => _recording = false;

  @override
  Future<void> dispose() => _amplitude.close();
}

/// A camera for tests: it hands back the image the test set.
class FakeReceiptImagePickerService implements ReceiptImagePickerService {
  FakeReceiptImagePickerService({this.mockImage});

  PickedReceiptImage? mockImage;

  @override
  Future<PickedReceiptImage?> pickFromCamera() async => mockImage;

  @override
  Future<PickedReceiptImage?> pickFromGallery() async => mockImage;
}
