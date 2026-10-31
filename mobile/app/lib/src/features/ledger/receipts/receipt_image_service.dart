import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Raw image bytes captured or picked from device.
final class PickedReceiptImage {
  const PickedReceiptImage({
    required this.bytes,
    this.mimeType = 'image/jpeg',
    this.name = 'receipt.jpg',
  });

  final Uint8List bytes;
  final String mimeType;
  final String name;
}

/// Abstract contract for picking receipt photos.
abstract class ReceiptImagePickerService {
  Future<bool> hasCameraPermission();
  Future<bool> requestCameraPermission();
  Future<PickedReceiptImage?> pickFromCamera();
  Future<PickedReceiptImage?> pickFromGallery();
}

/// In-memory fake service for tests and fallback.
class FakeReceiptImagePickerService implements ReceiptImagePickerService {
  FakeReceiptImagePickerService({
    this.hasPermission = true,
    this.permissionGrantedOnRequest = true,
    this.mockImage,
  });

  bool hasPermission;
  bool permissionGrantedOnRequest;
  PickedReceiptImage? mockImage;

  @override
  Future<bool> hasCameraPermission() async => hasPermission;

  @override
  Future<bool> requestCameraPermission() async {
    hasPermission = permissionGrantedOnRequest;
    return hasPermission;
  }

  @override
  Future<PickedReceiptImage?> pickFromCamera() async => mockImage;

  @override
  Future<PickedReceiptImage?> pickFromGallery() async => mockImage;
}

/// Provides the active [ReceiptImagePickerService].
final receiptImagePickerProvider = Provider<ReceiptImagePickerService>((ref) {
  return FakeReceiptImagePickerService();
});
