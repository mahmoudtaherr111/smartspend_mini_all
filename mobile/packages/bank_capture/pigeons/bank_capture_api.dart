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
  CaptureStatus({
    required this.method,
    required this.access,
    required this.connected,
    required this.notificationsAllowed,
    required this.waiting,
  });

  CaptureMethod method;
  CaptureAccess access;

  /// The native side holds a device token for the signed-in account (decision 0028).
  bool connected;

  /// The phone may show the app's notifications (Android 13 asks for it).
  bool notificationsAllowed;

  /// Signals captured and not yet sent.
  int waiting;

  /// When the last bank notification was captured and when the last batch reached the server (milliseconds since
  /// the epoch).
  int? lastCaptureAt;
  int? lastUploadAt;

  /// Why the last send failed, as an id ("offline", "device_revoked", "capture_disabled", "consent_required").
  String? lastError;
}

/// What the native side needs to send signals on its own, while the app is closed.
class CaptureSetup {
  CaptureSetup({
    required this.baseUrl,
    required this.deviceToken,
    required this.ownerKey,
    required this.language,
  });

  /// The API's origin, without a path.
  String baseUrl;

  /// From `capture.registerDevice`; kept encrypted by the native side and never given back to Dart.
  String deviceToken;

  /// The account the token belongs to ("local:12"). Signals captured for another account are dropped.
  String ownerKey;

  /// The interface language ("ar" or "en"), for the notices.
  String language;
}

@HostApi()
abstract class BankCaptureHostApi {
  CaptureStatus getStatus();

  /// Opens where the user grants access: Android's notification access screen for this app, or the Shortcuts
  /// app on iOS.
  void openAccessSettings();

  /// Starts capturing for the signed-in account with its device token.
  void connect(CaptureSetup setup);

  /// Stops capturing and forgets the token, the waiting signals and what was seen (signing out).
  void disconnect();

  /// The interface language changed.
  void setLanguage(String language);

  /// Sends what is waiting now.
  void sendNow();

  /// Asks for permission to show notifications (Android 13 and newer). True when the app may show them.
  @async
  bool requestNotificationPermission();
}
