/// Bank and wallet message capture: what this phone can do and whether the user allowed it.
///
/// Android reads notifications itself (a notification listener written in Kotlin); iOS relies on a Shortcuts
/// automation. See docs/decisions/0022-flutter-mobile-app.md.
library;

import 'src/bank_capture_api.g.dart';

export 'src/bank_capture_api.g.dart'
    show CaptureAccess, CaptureMethod, CaptureSetup, CaptureStatus;

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

  /// Starts capturing for the signed-in account with the device token `capture.registerDevice` gave this
  /// installation (decision 0028). The native side keeps the token encrypted and sends on its own.
  Future<void> connect(CaptureSetup setup) => _hostApi.connect(setup);

  /// Stops capturing and forgets the token, the waiting messages and what was seen. Signing out calls it.
  Future<void> disconnect() => _hostApi.disconnect();

  /// The interface language changed: the notices follow it.
  Future<void> setLanguage(String language) => _hostApi.setLanguage(language);

  /// Sends what is waiting now.
  Future<void> sendNow() => _hostApi.sendNow();

  /// Asks to show notifications (Android 13 and newer); true when the app may show them.
  Future<bool> requestNotificationPermission() =>
      _hostApi.requestNotificationPermission();
}
