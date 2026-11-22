import Flutter
import Foundation
import Security
import UIKit
import UserNotifications

/// Answers the Dart side of bank_capture (`pigeons/bank_capture_api.dart`) on iOS.
///
/// iOS gives no app access to SMS or to other apps' notifications. Messages arrive through a
/// Shortcuts automation running `RecordBankMessageIntent` (decisions 0022 and 0028).
/// This plugin stores the device capture token in the Keychain (readable after first unlock,
/// device-only) and non-secret metadata + offline queue in the shared App Group (`group.com.smartspend.app`)
/// so the App Intent and the main app stay in sync.
public class BankCapturePlugin: NSObject, FlutterPlugin, BankCaptureHostApi {
  private enum StorageKeys {
    static let appGroupId = "group.com.smartspend.app"
    static let keychainService = "com.smartspend.bank_capture"
    static let keychainAccount = "device_token"
    static let baseUrl = "smartspend.capture.baseUrl"
    static let ownerKey = "smartspend.capture.ownerKey"
    static let language = "smartspend.capture.language"
    static let pendingSignals = "smartspend.capture.pendingSignals"
    static let lastCaptureAt = "smartspend.capture.lastCaptureAt"
    static let lastUploadAt = "smartspend.capture.lastUploadAt"
    static let lastError = "smartspend.capture.lastError"
  }

  private let uploadQueue = DispatchQueue(label: "com.smartspend.bank_capture.ios.upload")
  private var isUploading = false

  public static func register(with registrar: FlutterPluginRegistrar) {
    BankCaptureHostApiSetup.setUp(
      binaryMessenger: registrar.messenger(),
      api: BankCapturePlugin()
    )
  }

  func getStatus() throws -> CaptureStatus {
    let defaults = sharedDefaults()
    let hasToken = readDeviceToken() != nil
    let baseUrl = defaults.string(forKey: StorageKeys.baseUrl)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let connected = hasToken && !baseUrl.isEmpty
    let pending = readPendingSignals(defaults: defaults)
    let lastCaptureAt = readOptionalInt64(defaults: defaults, key: StorageKeys.lastCaptureAt)
    let lastUploadAt = readOptionalInt64(defaults: defaults, key: StorageKeys.lastUploadAt)
    let lastError = defaults.string(forKey: StorageKeys.lastError)

    // The automation lives in the Shortcuts app, which tells no other app whether it exists,
    // so access remains `.unknown` while `connected` reflects whether the device token is stored.
    return CaptureStatus(
      method: .shortcutsAutomation,
      access: .unknown,
      connected: connected,
      notificationsAllowed: true,
      waiting: Int64(pending.count),
      lastCaptureAt: lastCaptureAt,
      lastUploadAt: lastUploadAt,
      lastError: lastError,
      smsSupported: false,
      smsAccess: .notGranted
    )
  }

  func openAccessSettings() throws {
    DispatchQueue.main.async {
      if let shortcutsUrl = URL(string: "shortcuts://"),
         UIApplication.shared.canOpenURL(shortcutsUrl)
      {
        UIApplication.shared.open(shortcutsUrl, options: [:], completionHandler: nil)
      } else if let shortcutsUrl = URL(string: "shortcuts://") {
        UIApplication.shared.open(shortcutsUrl, options: [:], completionHandler: nil)
      } else if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(settingsUrl, options: [:], completionHandler: nil)
      }
    }
  }

  func connect(setup: CaptureSetup) throws {
    let trimmedToken = setup.deviceToken.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedBaseUrl = setup.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedToken.isEmpty, !trimmedBaseUrl.isEmpty else {
      throw PigeonError(
        code: "invalid-setup",
        message: "Capture setup requires non-empty baseUrl and deviceToken",
        details: nil
      )
    }

    let defaults = sharedDefaults()
    let previousOwner = defaults.string(forKey: StorageKeys.ownerKey)
    if let previousOwner, previousOwner != setup.ownerKey {
      // Account switched: drop signals queued for the previous account (decision 0028).
      defaults.removeObject(forKey: StorageKeys.pendingSignals)
      defaults.removeObject(forKey: StorageKeys.lastCaptureAt)
      defaults.removeObject(forKey: StorageKeys.lastUploadAt)
    }

    try writeDeviceToken(trimmedToken)
    defaults.set(trimmedBaseUrl, forKey: StorageKeys.baseUrl)
    defaults.set(setup.ownerKey, forKey: StorageKeys.ownerKey)
    defaults.set(setup.language == "en" ? "en" : "ar", forKey: StorageKeys.language)
    defaults.removeObject(forKey: StorageKeys.lastError)
  }

  func disconnect() throws {
    deleteDeviceToken()
    let defaults = sharedDefaults()
    defaults.removeObject(forKey: StorageKeys.baseUrl)
    defaults.removeObject(forKey: StorageKeys.ownerKey)
    defaults.removeObject(forKey: StorageKeys.pendingSignals)
    defaults.removeObject(forKey: StorageKeys.lastCaptureAt)
    defaults.removeObject(forKey: StorageKeys.lastUploadAt)
    defaults.removeObject(forKey: StorageKeys.lastError)
  }

  func setLanguage(language: String) throws {
    sharedDefaults().set(language == "en" ? "en" : "ar", forKey: StorageKeys.language)
  }

  func sendNow() throws {
    uploadQueue.async { [weak self] in
      self?.flushPendingSignals()
    }
  }

  func requestNotificationPermission() async throws -> Bool {
    return await withCheckedContinuation { continuation in
      UNUserNotificationCenter.current().requestAuthorization(
        options: [.alert, .badge, .sound]
      ) { granted, _ in
        continuation.resume(returning: granted)
      }
    }
  }

  // iOS gives no app access to SMS: Shortcuts automations are the way in (decision 0028).
  func requestSmsPermission() async throws -> Bool { false }

  func importSmsInbox(days: Int64, max: Int64) throws -> Int64 { 0 }

  // MARK: - Pending Queue Flush

  private func flushPendingSignals() {
    guard !isUploading else { return }
    let defaults = sharedDefaults()
    let pending = readPendingSignals(defaults: defaults)
    guard !pending.isEmpty else { return }

    guard let token = readDeviceToken(),
          let baseUrl = defaults.string(forKey: StorageKeys.baseUrl)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
          !baseUrl.isEmpty,
          let endpoint = URL(
            string: baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
              + "/api/capture/v1/signals"
          )
    else {
      return
    }

    isUploading = true
    let batch = Array(pending.prefix(20))
    let remaining = Array(pending.dropFirst(batch.count))
    let lang = defaults.string(forKey: StorageKeys.language) == "en" ? "en" : "ar"

    let payload: [String: Any] = [
      "signals": batch,
      "lang": lang,
    ]
    guard let bodyData = try? JSONSerialization.data(withJSONObject: payload) else {
      isUploading = false
      return
    }

    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(token, forHTTPHeaderField: "X-Capture-Device")
    request.httpBody = bodyData

    let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      guard let self = self else { return }
      self.uploadQueue.async {
        defer { self.isUploading = false }
        let defaults = self.sharedDefaults()

        if error != nil {
          defaults.set("offline", forKey: StorageKeys.lastError)
          return
        }

        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200...299).contains(statusCode) {
          self.writePendingSignals(remaining, defaults: defaults)
          defaults.set(Int64(Date().timeIntervalSince1970 * 1000), forKey: StorageKeys.lastUploadAt)
          defaults.removeObject(forKey: StorageKeys.lastError)
          if !remaining.isEmpty {
            self.uploadQueue.async { [weak self] in
              self?.flushPendingSignals()
            }
          }
          return
        }

        if statusCode == 401 {
          self.deleteDeviceToken()
          defaults.set("device_revoked", forKey: StorageKeys.lastError)
          return
        }

        if statusCode == 426 {
          defaults.set("update_required", forKey: StorageKeys.lastError)
          return
        }

        let errorCode = Self.parseErrorCode(from: data)
        defaults.set(errorCode ?? "offline", forKey: StorageKeys.lastError)
      }
    }
    task.resume()
  }

  // MARK: - Keychain & Shared Defaults Helpers

  private func sharedDefaults() -> UserDefaults {
    return UserDefaults(suiteName: StorageKeys.appGroupId) ?? UserDefaults.standard
  }

  private func readOptionalInt64(defaults: UserDefaults, key: String) -> Int64? {
    guard defaults.object(forKey: key) != nil else { return nil }
    let value = (defaults.object(forKey: key) as? NSNumber)?.int64Value
    return (value ?? 0) > 0 ? value : nil
  }

  private func readPendingSignals(defaults: UserDefaults) -> [[String: Any]] {
    guard let data = defaults.data(forKey: StorageKeys.pendingSignals),
          let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return []
    }
    return list
  }

  private func writePendingSignals(_ list: [[String: Any]], defaults: UserDefaults) {
    if list.isEmpty {
      defaults.removeObject(forKey: StorageKeys.pendingSignals)
    } else if let data = try? JSONSerialization.data(withJSONObject: list) {
      defaults.set(data, forKey: StorageKeys.pendingSignals)
    }
  }

  private func writeDeviceToken(_ token: String) throws {
    deleteDeviceToken()
    let addQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: StorageKeys.keychainService,
      kSecAttrAccount as String: StorageKeys.keychainAccount,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecValueData as String: Data(token.utf8),
    ]
    let status = SecItemAdd(addQuery as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw PigeonError(
        code: "keychain-error",
        message: "Failed to persist capture device token (\(status))",
        details: nil
      )
    }
  }

  private func readDeviceToken() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: StorageKeys.keychainService,
      kSecAttrAccount as String: StorageKeys.keychainAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess,
          let data = item as? Data,
          let token = String(data: data, encoding: .utf8),
          !token.isEmpty
    else {
      return nil
    }
    return token
  }

  private func deleteDeviceToken() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: StorageKeys.keychainService,
      kSecAttrAccount as String: StorageKeys.keychainAccount,
    ]
    SecItemDelete(query as CFDictionary)
  }

  private static func parseErrorCode(from data: Data?) -> String? {
    guard let data,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let code = json["error"] as? String,
          !code.isEmpty
    else {
      return nil
    }
    return code
  }
}
