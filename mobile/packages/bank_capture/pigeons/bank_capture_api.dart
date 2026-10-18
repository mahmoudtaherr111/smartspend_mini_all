// The contract between Dart and the native side of bank_capture. Pigeon turns it into
// lib/src/bank_capture_api.g.dart, Kotlin and Swift; after editing it, run from this package:
//   dart run pigeon --input pigeons/bank_capture_api.dart && dart format lib/src
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/src/bank_capture_api.g.dart',
    dartPackageName: 'bank_capture',
    kotlinOut: 'android/src/main/kotlin/com/smartspend/bank_capture/BankCaptureApi.g.kt',
    kotlinOptions: KotlinOptions(package: 'com.smartspend.bank_capture'),
    swiftOut: 'ios/bank_capture/Sources/bank_capture/BankCaptureApi.g.swift',
  ),
)
/// How this phone can hand bank and wallet messages to the app.
enum CaptureMethod {
  /// Android: the app reads the notifications of bank, wallet and SMS apps itself.
  notificationListener,

  /// iOS: a Shortcuts automation on incoming messages passes each message to the app.
  shortcutsAutomation,
}

/// Whether the user let the app capture messages.
enum CaptureAccess {
  /// The user granted the access the method needs.
  granted,

  /// The method needs access the user has not granted yet.
  notGranted,

  /// The app cannot tell: on iOS the automation lives in the Shortcuts app.
  unknown,
}

class CaptureStatus {
  CaptureStatus({required this.method, required this.access});

  CaptureMethod method;
  CaptureAccess access;
}

@HostApi()
abstract class BankCaptureHostApi {
  CaptureStatus getStatus();

  /// Opens where the user grants access: Android's notification access screen for this app, or the Shortcuts
  /// app on iOS.
  void openAccessSettings();
}
