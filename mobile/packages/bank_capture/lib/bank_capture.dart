/// Bank and wallet message capture: what this phone can do and whether the user allowed it.
///
/// Android reads notifications itself (a notification listener written in Kotlin); iOS relies on a Shortcuts
/// automation. See docs/decisions/0022-flutter-mobile-app.md.
library;

import 'src/bank_capture_api.g.dart';

export 'src/bank_capture_api.g.dart'
    show CaptureAccess, CaptureMethod, CaptureStatus;

/// The app's view of message capture on this phone.
class BankCapture {
  BankCapture({BankCaptureHostApi? hostApi})
    : _hostApi = hostApi ?? BankCaptureHostApi();

  final BankCaptureHostApi _hostApi;

  /// How this phone captures messages and whether the user allowed it.
  Future<CaptureStatus> status() => _hostApi.getStatus();

  /// Opens the screen where the user grants access: Android's notification access for this app, or the
  /// Shortcuts app on iOS. Ask [status] again when the app returns to the foreground.
  Future<void> openAccessSettings() => _hostApi.openAccessSettings();
}
