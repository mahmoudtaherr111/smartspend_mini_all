// The contract between Dart and the native side of device_lock. Pigeon turns it into
// lib/src/device_lock_api.g.dart, Kotlin and Swift; after editing it, run from this package:
//   dart run pigeon --input pigeons/device_lock_api.dart && dart format lib/src
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/src/device_lock_api.g.dart',
    dartPackageName: 'device_lock',
    kotlinOut:
        'android/src/main/kotlin/com/smartspend/device_lock/DeviceLockApi.g.kt',
    kotlinOptions: KotlinOptions(package: 'com.smartspend.device_lock'),
    swiftOut: 'ios/device_lock/Sources/device_lock/DeviceLockApi.g.swift',
  ),
)
/// Which biometric the phone has, so the app can name it («البصمة», «بصمة الوجه»).
enum BiometricKind {
  none,
  fingerprint,
  face,
  iris,

  /// More than one: Android does not say which one the person will use.
  several,
}

/// Whether biometrics can open the app on this phone.
enum BiometricAvailability {
  /// No biometric strong enough to guard a key (Android: class 3 on Android 11 or newer), or none at all.
  unsupported,

  /// The phone has one, but the person has not set it up in the phone's settings.
  notEnrolled,

  ready,
}

class LockCapabilities {
  LockCapabilities({required this.kind, required this.availability});

  BiometricKind kind;
  BiometricAvailability availability;
}

/// How a biometric prompt ended.
enum BiometricOutcome {
  /// The person was recognised and the key gave back the secret.
  success,

  /// The person closed the prompt or chose the PIN instead.
  cancelled,

  /// Too many attempts: the phone blocks biometrics for a while.
  lockedOut,

  /// The biometrics on the phone changed since the app's key was made, so the key no longer opens. The native side
  /// has already deleted it; the person turns biometrics on again after entering the PIN.
  changed,

  /// Biometrics cannot run now: none set up, no screen to show the prompt on, or no passcode on the phone.
  unavailable,

  /// Anything else; the PIN still works.
  failed,
}

/// The words of the system prompt, in the app's language.
class BiometricPromptText {
  BiometricPromptText({
    required this.title,
    required this.reason,
    required this.usePin,
  });

  String title;
  String reason;

  /// The button that closes the prompt for the PIN pad.
  String usePin;
}

class BiometricResult {
  BiometricResult({required this.outcome, this.secret, this.sealed});

  BiometricOutcome outcome;

  /// On success: the 32 random bytes the key guards. The app compares their hash with the one it kept.
  Uint8List? secret;

  /// Android, after enrolment: the secret sealed by the key, which the app keeps and passes back to unlock. iOS
  /// keeps the secret in the Keychain and returns null.
  Uint8List? sealed;
}

@HostApi()
abstract class DeviceLockHostApi {
  LockCapabilities capabilities();

  /// Makes a new key that only the biometrics enrolled now can use, asks for them once, and returns a new secret
  /// guarded by the key. Replaces any earlier key.
  @async
  BiometricResult enrollBiometrics(BiometricPromptText text);

  /// Asks for the biometrics and returns the secret the key guards. [sealed] is what enrolment returned.
  @async
  BiometricResult unlockWithBiometrics(
    BiometricPromptText text,
    Uint8List? sealed,
  );

  void forgetBiometrics();

  /// HMAC-SHA256 of [input] with a key that never leaves the phone's Keystore (Android) or this device's Keychain
  /// (iOS). [create] makes the key when there is none; without it a missing key is an error, since every tag made
  /// before is then unverifiable.
  Uint8List pinTag(Uint8List input, bool create);

  void forgetPinKey();

  /// Hides the app's content in the app switcher: Android 13 and newer keep its screenshot out of Recents (people
  /// can still take screenshots), older Android sets FLAG_SECURE, and iOS covers the window while the app is not
  /// active.
  void setSwitcherCover(bool enabled);
}
