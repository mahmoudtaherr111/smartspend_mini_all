import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

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

/// Picks a receipt photo. Null means the person closed the picker.
abstract class ReceiptImagePickerService {
  Future<PickedReceiptImage?> pickFromCamera();
  Future<PickedReceiptImage?> pickFromGallery();
}

/// The phone's camera and gallery. The system picker asks for its own permission, and it scales and compresses the
/// photo, so a receipt reaches the server small enough for an Egyptian mobile connection and still readable.
class DeviceReceiptImagePickerService implements ReceiptImagePickerService {
  final _picker = ImagePicker();

  Future<PickedReceiptImage?> _pick(ImageSource source) async {
    final file = await _picker.pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 2400,
      imageQuality: 80,
    );
    if (file == null) return null;
    return PickedReceiptImage(bytes: await file.readAsBytes());
  }

  @override
  Future<PickedReceiptImage?> pickFromCamera() => _pick(ImageSource.camera);

  @override
  Future<PickedReceiptImage?> pickFromGallery() => _pick(ImageSource.gallery);
}

/// Provides the active [ReceiptImagePickerService].
final receiptImagePickerProvider = Provider<ReceiptImagePickerService>((ref) {
  return DeviceReceiptImagePickerService();
});
