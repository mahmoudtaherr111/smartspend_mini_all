import Flutter
import UIKit

/// Shared handoff storage between the iOS Share Extension, `smartspend://share?text=...`
/// URLs, Shortcuts fallback, and Flutter's `SharedTextReceiver` (`com.smartspend.app/share`).
enum SmartSpendShareBridge {
  static let appGroupId = "group.com.smartspend.app"
  static let pendingSharedTextKey = "pendingSharedText"
  static let channelName = "com.smartspend.app/share"

  static func storePendingText(_ rawText: String) {
    let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    if let sharedDefaults = UserDefaults(suiteName: appGroupId) {
      sharedDefaults.set(trimmed, forKey: pendingSharedTextKey)
    }
    UserDefaults.standard.set(trimmed, forKey: pendingSharedTextKey)
  }

  static func consumePendingText() -> String? {
    var found: String?
    if let sharedDefaults = UserDefaults(suiteName: appGroupId),
       let groupText = sharedDefaults.string(forKey: pendingSharedTextKey)?
         .trimmingCharacters(in: .whitespacesAndNewlines),
       !groupText.isEmpty
    {
      found = groupText
      sharedDefaults.removeObject(forKey: pendingSharedTextKey)
    }

    if let localText = UserDefaults.standard.string(forKey: pendingSharedTextKey)?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      !localText.isEmpty
    {
      if found == nil {
        found = localText
      }
      UserDefaults.standard.removeObject(forKey: pendingSharedTextKey)
    }

    return found
  }

  /// Extracts shared text from `smartspend://share?text=...` deep links.
  @discardableResult
  static func handleIncomingUrl(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "smartspend" else {
      return false
    }
    let host = url.host?.lowercased() ?? ""
    let path = url.path.lowercased()
    guard host == "share" || path == "/share" else {
      return false
    }
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let queryItems = components.queryItems
    else {
      return false
    }
    let text = queryItems.first(where: { $0.name == "text" })?.value
      ?? queryItems.first(where: { $0.name == "message" })?.value
      ?? queryItems.first(where: { $0.name == "body" })?.value
    guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return false
    }
    storePendingText(text)
    return true
  }
}

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var shareChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if let url = launchOptions?[.url] as? URL {
      SmartSpendShareBridge.handleIncomingUrl(url)
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if SmartSpendShareBridge.handleIncomingUrl(url) {
      return true
    }
    return super.application(app, open: url, options: options)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "SmartSpendShareChannel") {
      let channel = FlutterMethodChannel(
        name: SmartSpendShareBridge.channelName,
        binaryMessenger: registrar.messenger()
      )
      channel.setMethodCallHandler { call, result in
        switch call.method {
        case "getSharedText":
          result(SmartSpendShareBridge.consumePendingText())
        default:
          result(FlutterMethodNotImplemented)
        }
      }
      shareChannel = channel
    }
  }
}
