import Foundation
import Security

#if canImport(AppIntents)
import AppIntents

/// Apple Shortcuts App Intent enabling silent iOS 17+ bank/wallet SMS automation
/// (decisions 0022 and 0028).
///
/// Reads the registered device capture token from the shared Keychain and posts
/// directly to `POST /api/capture/v1/signals` (`contracts/capture-intake.ts`).
/// Never exposes a token inside a Shortcut URL. If offline, queues the signal in
/// App Group storage for `BankCapturePlugin.sendNow()` to flush later.
@available(iOS 16.0, *)
struct RecordBankMessageIntent: AppIntent {
  static var title: LocalizedStringResource = "تسجيل رسالة بنك في SmartSpend"
  static var description = IntentDescription(
    "يرسل رسالة البنك أو المحفظة إلى SmartSpend AI لتحليلها وتسجيل العملية تلقائياً."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "نص الرسالة",
    description: "نص رسالة البنك أو المحفظة الإلكترونية"
  )
  var messageText: String

  @Parameter(
    title: "المرسل",
    description: "اسم البنك أو المحفظة (اختياري)"
  )
  var sender: String?

  static var parameterSummary: some ParameterSummary {
    Summary("سجّل رسالة \(\.$messageText) من \(\.$sender)")
  }

  private enum StorageKeys {
    static let appGroupId = "group.com.smartspend.app"
    static let keychainService = "com.smartspend.bank_capture"
    static let keychainAccount = "device_token"
    static let baseUrl = "smartspend.capture.baseUrl"
    static let language = "smartspend.capture.language"
    static let pendingSignals = "smartspend.capture.pendingSignals"
    static let lastCaptureAt = "smartspend.capture.lastCaptureAt"
    static let lastUploadAt = "smartspend.capture.lastUploadAt"
    static let lastError = "smartspend.capture.lastError"
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let trimmedText = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedText.isEmpty else {
      return .result(dialog: "الرسالة فاضية، مفيش حاجة تتسجل.")
    }

    let trimmedSender = sender?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .prefix(64)
      .description
    let safeText = String(trimmedText.prefix(2000))

    let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime]
    let postedAt = isoFormatter.string(from: Date())
    let signalId = "ios_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()

    var signal: [String: Any] = [
      "id": signalId,
      "channel": "shortcut",
      "text": safeText,
      "postedAt": postedAt,
    ]
    if let trimmedSender, !trimmedSender.isEmpty {
      signal["sender"] = trimmedSender
    }

    let defaults = Self.sharedDefaults()
    guard let token = Self.readDeviceToken(),
          let baseUrl = defaults.string(forKey: StorageKeys.baseUrl)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
          !baseUrl.isEmpty,
          let endpoint = URL(string: baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/capture/v1/signals")
    else {
      // Capture device token not yet connected: hand off via ShareBridge so opening the app still processes it.
      SmartSpendShareBridge.storePendingText(safeText)
      return .result(
        dialog: "حفظنا الرسالة لحد ما تفتح SmartSpend. عشان التسجيل التلقائي يشتغل لوحده، فعّل ربط رسايل البنك من الإعدادات."
      )
    }

    defaults.set(nowMs, forKey: StorageKeys.lastCaptureAt)
    let lang = (defaults.string(forKey: StorageKeys.language) == "en") ? "en" : "ar"

    let payload: [String: Any] = [
      "signals": [signal],
      "lang": lang,
    ]

    guard let bodyData = try? JSONSerialization.data(withJSONObject: payload) else {
      return .result(dialog: "ماقدرناش نجهّز الرسالة دلوقتي.")
    }

    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(token, forHTTPHeaderField: "X-Capture-Device")
    request.httpBody = bodyData

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

      if (200...299).contains(statusCode) {
        defaults.set(Int64(Date().timeIntervalSince1970 * 1000), forKey: StorageKeys.lastUploadAt)
        defaults.removeObject(forKey: StorageKeys.lastError)
        return .result(dialog: "تم إرسال الرسالة إلى SmartSpend AI بنجاح.")
      }

      let serverError = Self.parseErrorCode(from: data)
      if statusCode == 401 {
        Self.deleteDeviceToken()
        defaults.set("device_revoked", forKey: StorageKeys.lastError)
        return .result(dialog: "اتصال الجهاز انتهى. افتح SmartSpend AI وجدّد ربط الرسايل.")
      }
      if statusCode == 426 {
        defaults.set("update_required", forKey: StorageKeys.lastError)
        return .result(dialog: "محتاج تحدّث تطبيق SmartSpend AI لآخر نسخة.")
      }
      if statusCode == 403 || statusCode == 503 {
        defaults.set(serverError ?? "capture_disabled", forKey: StorageKeys.lastError)
        Self.enqueuePendingSignal(signal, defaults: defaults)
        return .result(dialog: "حفظنا الرسالة مؤقتاً، وهتتبعت أول ما الخدمة ترجع.")
      }

      defaults.set(serverError ?? "offline", forKey: StorageKeys.lastError)
      Self.enqueuePendingSignal(signal, defaults: defaults)
      return .result(dialog: "حفظنا الرسالة وهنحاول نبعتها تاني تلقائياً.")
    } catch {
      defaults.set("offline", forKey: StorageKeys.lastError)
      Self.enqueuePendingSignal(signal, defaults: defaults)
      return .result(dialog: "مفيش إنترنت دلوقتي — حفظنا الرسالة وهتتبعت أول ما النت يرجع.")
    }
  }

  // MARK: - Shared Storage Helpers

  private static func sharedDefaults() -> UserDefaults {
    return UserDefaults(suiteName: StorageKeys.appGroupId) ?? UserDefaults.standard
  }

  private static func readDeviceToken() -> String? {
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

  private static func deleteDeviceToken() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: StorageKeys.keychainService,
      kSecAttrAccount as String: StorageKeys.keychainAccount,
    ]
    SecItemDelete(query as CFDictionary)
  }

  private static func enqueuePendingSignal(_ signal: [String: Any], defaults: UserDefaults) {
    var queue = readPendingQueue(defaults: defaults)
    queue.append(signal)
    if queue.count > 100 {
      queue = Array(queue.suffix(100))
    }
    if let data = try? JSONSerialization.data(withJSONObject: queue) {
      defaults.set(data, forKey: StorageKeys.pendingSignals)
    }
  }

  private static func readPendingQueue(defaults: UserDefaults) -> [[String: Any]] {
    guard let data = defaults.data(forKey: StorageKeys.pendingSignals),
          let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return []
    }
    return parsed
  }

  private static func parseErrorCode(from data: Data) -> String? {
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let error = json["error"] as? String,
          !error.isEmpty
    else {
      return nil
    }
    return error
  }
}

@available(iOS 16.0, *)
struct SmartSpendShortcutsProvider: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RecordBankMessageIntent(),
      phrases: [
        "سجّل رسالة بنك في \(.applicationName)",
        "Record bank message in \(.applicationName)",
      ],
      shortTitle: "تسجيل رسالة بنك",
      systemImageName: "creditcard.and.123"
    )
  }
}
#endif
