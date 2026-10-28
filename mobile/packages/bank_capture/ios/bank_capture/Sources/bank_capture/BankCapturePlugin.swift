import Flutter
import UIKit

/// Answers the Dart side of bank_capture (pigeons/bank_capture_api.dart) on iOS.
///
/// iOS gives no app access to SMS or to other apps' notifications. Messages will arrive through a Shortcuts
/// automation that runs an App Intent (step P5 of the capture plan, decision 0028). Until then the capture calls do
/// nothing here: the app shows capture as the Shortcuts app's and never offers to turn it on.
public class BankCapturePlugin: NSObject, FlutterPlugin, BankCaptureHostApi {
  public static func register(with registrar: FlutterPluginRegistrar) {
    BankCaptureHostApiSetup.setUp(binaryMessenger: registrar.messenger(), api: BankCapturePlugin())
  }

  func getStatus() throws -> CaptureStatus {
    // The automation lives in the Shortcuts app, which tells no other app whether it exists.
    CaptureStatus(
      method: .shortcutsAutomation,
      access: .unknown,
      connected: false,
      notificationsAllowed: true,
      waiting: 0
    )
  }

  func openAccessSettings() throws {
    guard let url = URL(string: "shortcuts://") else { return }
    UIApplication.shared.open(url)
  }

  func connect(setup: CaptureSetup) throws {}

  func disconnect() throws {}

  func setLanguage(language: String) throws {}

  func sendNow() throws {}

  func requestNotificationPermission() async throws -> Bool { true }
}
