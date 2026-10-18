import Flutter
import UIKit

/// Answers the Dart side of bank_capture (pigeons/bank_capture_api.dart) on iOS.
///
/// iOS gives no app access to SMS or to other apps' notifications. Messages arrive through a Shortcuts automation
/// that runs an App Intent of this app; milestone 5 of docs/decisions/0022-flutter-mobile-app.md adds that intent.
public class BankCapturePlugin: NSObject, FlutterPlugin, BankCaptureHostApi {
  public static func register(with registrar: FlutterPluginRegistrar) {
    BankCaptureHostApiSetup.setUp(binaryMessenger: registrar.messenger(), api: BankCapturePlugin())
  }

  func getStatus() throws -> CaptureStatus {
    // The automation lives in the Shortcuts app, which tells no other app whether it exists.
    CaptureStatus(method: .shortcutsAutomation, access: .unknown)
  }

  func openAccessSettings() throws {
    guard let url = URL(string: "shortcuts://") else { return }
    UIApplication.shared.open(url)
  }
}
