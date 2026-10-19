import CryptoKit
import Flutter
import LocalAuthentication
import Security
import UIKit

/// Answers the Dart side of device_lock (pigeons/device_lock_api.dart) on iOS.
///
/// Biometrics are bound to a Keychain item, not to a callback (OWASP MASTG-BEST-0036): a random secret whose access
/// control is `.biometryCurrentSet`, so only Face ID or Touch ID as enrolled now can read it, and a face or finger
/// added later cannot (MASWE-0022). The item is this device's only and needs a passcode on the phone.
public class DeviceLockPlugin: NSObject, FlutterPlugin, DeviceLockHostApi {
  private static let service = "com.smartspend.lock"
  private static let biometricAccount = "smartspend.lock.biometric"
  private static let pinAccount = "smartspend.lock.pin"
  /// The enrolled biometrics when the key was made, to tell "changed" from "not recognised".
  private static let domainStateKey = "smartspend.lock.biometricState"

  private var coverEnabled = false
  private var cover: UIView?
  /// While the app's own Face ID prompt is up the app is inactive, but the lock screen is what shows: no cover.
  private var authenticating = false

  public static func register(with registrar: FlutterPluginRegistrar) {
    let plugin = DeviceLockPlugin()
    DeviceLockHostApiSetup.setUp(binaryMessenger: registrar.messenger(), api: plugin)
    let center = NotificationCenter.default
    // Scene and app notifications both: the app runs in a scene, and either may come first.
    center.addObserver(
      plugin, selector: #selector(coverContent), name: UIScene.willDeactivateNotification, object: nil)
    center.addObserver(
      plugin, selector: #selector(coverContent), name: UIApplication.willResignActiveNotification, object: nil)
    center.addObserver(
      plugin, selector: #selector(uncoverContent), name: UIScene.didActivateNotification, object: nil)
    center.addObserver(
      plugin, selector: #selector(uncoverContent), name: UIApplication.didBecomeActiveNotification, object: nil)
  }

  func capabilities() throws -> LockCapabilities {
    let context = LAContext()
    var error: NSError?
    let ready = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    var kind = BiometricKind.none
    switch context.biometryType {
    case .faceID: kind = .face
    case .touchID: kind = .fingerprint
    default:
      if #available(iOS 17.0, *), context.biometryType == .opticID { kind = .iris }
    }
    let availability: BiometricAvailability
    if ready || error?.code == LAError.biometryLockout.rawValue {
      availability = .ready
    } else if error?.code == LAError.biometryNotEnrolled.rawValue {
      availability = .notEnrolled
    } else {
      // No hardware, no passcode, or the person refused Face ID to this app in Settings.
      availability = .unsupported
    }
    return LockCapabilities(kind: kind, availability: availability)
  }

  func enrollBiometrics(text: BiometricPromptText) async throws -> BiometricResult {
    try? forgetBiometrics()
    guard
      let access = SecAccessControlCreateWithFlags(
        nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, nil)
    else { return BiometricResult(outcome: .unavailable) }
    var secret = Data(count: 32)
    let generated = secret.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
    guard generated == errSecSuccess else { return BiometricResult(outcome: .failed) }
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: Self.biometricAccount,
      kSecAttrAccessControl as String: access,
      kSecValueData as String: secret,
    ]
    // Adding needs no prompt; it fails when the phone has no passcode.
    guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else {
      return BiometricResult(outcome: .unavailable)
    }
    let context = LAContext()
    if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) {
      UserDefaults.standard.set(context.evaluatedPolicyDomainState, forKey: Self.domainStateKey)
    }
    // Reading it back once asks for Face ID or Touch ID: the person proves it works before the app relies on it.
    let read = await readSecret(text: text)
    if read.outcome != .success { try? forgetBiometrics() }
    return read
  }

  func unlockWithBiometrics(text: BiometricPromptText, sealed: FlutterStandardTypedData?) async throws
    -> BiometricResult
  {
    let context = LAContext()
    var error: NSError?
    if !context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
      let lockedOut = error?.code == LAError.biometryLockout.rawValue
      return BiometricResult(outcome: lockedOut ? .lockedOut : .unavailable)
    }
    let enrolled = UserDefaults.standard.data(forKey: Self.domainStateKey)
    if let enrolled, let now = context.evaluatedPolicyDomainState, enrolled != now {
      try? forgetBiometrics()
      return BiometricResult(outcome: .changed)
    }
    return await readSecret(text: text)
  }

  func forgetBiometrics() throws {
    deleteItem(account: Self.biometricAccount)
    UserDefaults.standard.removeObject(forKey: Self.domainStateKey)
  }

  func pinTag(input: FlutterStandardTypedData, create: Bool) throws -> FlutterStandardTypedData {
    let key: Data
    if let stored = readPlainItem(account: Self.pinAccount) {
      key = stored
    } else if create {
      key = try newPinKey()
    } else {
      throw PigeonError(code: "no-pin-key", message: "the PIN key is gone", details: nil)
    }
    let tag = HMAC<SHA256>.authenticationCode(for: input.data, using: SymmetricKey(data: key))
    return FlutterStandardTypedData(bytes: Data(tag))
  }

  func forgetPinKey() throws {
    deleteItem(account: Self.pinAccount)
  }

  func setSwitcherCover(enabled: Bool) throws {
    coverEnabled = enabled
    if !enabled { uncoverContent() }
  }

  // MARK: The cover in the app switcher

  /// iOS takes the app switcher's picture after the app stops being active; a view over the window by then keeps
  /// the amounts out of it.
  @objc private func coverContent() {
    guard coverEnabled, !authenticating, cover == nil, let window = activeWindow() else { return }
    let view = UIView(frame: window.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.backgroundColor = .systemBackground
    let symbol = UIImageView(image: UIImage(systemName: "lock.fill"))
    symbol.tintColor = .secondaryLabel
    symbol.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 44, weight: .regular)
    symbol.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(symbol)
    NSLayoutConstraint.activate([
      symbol.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      symbol.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
    window.addSubview(view)
    cover = view
  }

  @objc private func uncoverContent() {
    cover?.removeFromSuperview()
    cover = nil
  }

  private func activeWindow() -> UIWindow? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    return windows.first { $0.isKeyWindow } ?? windows.first
  }

  // MARK: The Keychain

  /// Reads the biometric item, which shows the Face ID or Touch ID prompt. The Keychain blocks the thread while the
  /// prompt is up, so the read runs off the main thread.
  private func readSecret(text: BiometricPromptText) async -> BiometricResult {
    let context = LAContext()
    context.localizedReason = text.reason
    context.localizedCancelTitle = text.usePin
    // No "Enter Password" button: the phone's passcode is not the app's PIN.
    context.localizedFallbackTitle = ""
    authenticating = true
    defer { authenticating = false }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: Self.biometricAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecUseAuthenticationContext as String: context,
    ]
    let (status, data) = await withCheckedContinuation { (done: CheckedContinuation<(OSStatus, Data?), Never>) in
      DispatchQueue.global(qos: .userInitiated).async {
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        done.resume(returning: (status, item as? Data))
      }
    }
    switch status {
    case errSecSuccess:
      guard let data else { return BiometricResult(outcome: .failed) }
      return BiometricResult(outcome: .success, secret: FlutterStandardTypedData(bytes: data))
    case errSecUserCanceled:
      return BiometricResult(outcome: .cancelled)
    case errSecItemNotFound:
      // .biometryCurrentSet: the item stops opening once the enrolled faces or fingers change.
      try? forgetBiometrics()
      return BiometricResult(outcome: .changed)
    default:
      var error: NSError?
      _ = LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
      return BiometricResult(outcome: error?.code == LAError.biometryLockout.rawValue ? .lockedOut : .failed)
    }
  }

  private func newPinKey() throws -> Data {
    var key = Data(count: 32)
    let generated = key.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
    guard generated == errSecSuccess else {
      throw PigeonError(code: "no-random", message: "no random bytes", details: nil)
    }
    let add: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: Self.pinAccount,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      kSecValueData as String: key,
    ]
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw PigeonError(code: "keychain", message: "could not keep the PIN key (\(status))", details: nil)
    }
    return key
  }

  private func readPlainItem(account: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }

  private func deleteItem(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
