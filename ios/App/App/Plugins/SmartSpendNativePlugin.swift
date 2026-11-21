import Foundation
import UIKit
import LocalAuthentication
import Capacitor

@objc(SmartSpendNativePlugin)
public class SmartSpendNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SmartSpendNativePlugin"
    public let jsName = "SmartSpendNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticateBiometric", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "triggerHaptic", returnType: CAPPluginReturnPromise)
    ]

    @objc public func getCapabilities(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let iosVersion = UIDevice.current.systemVersion
            let iosMajorVersion = ProcessInfo.processInfo.operatingSystemVersion.majorVersion

            let bioContext = LAContext()
            var bioError: NSError?
            let hasBiometrics = bioContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &bioError)

            let ownerContext = LAContext()
            var ownerError: NSError?
            let canEvaluateDeviceOwnerAuth = ownerContext.canEvaluatePolicy(.deviceOwnerAuthentication, error: &ownerError)

            let biometricType: String
            switch bioContext.biometryType {
            case .faceID:
                biometricType = "faceId"
            case .touchID:
                biometricType = "touchId"
            default:
                if #available(iOS 17.0, *), bioContext.biometryType == .opticID {
                    biometricType = "opticId"
                } else {
                    biometricType = "none"
                }
            }

            call.resolve([
                "platform": "ios",
                "iosVersion": iosVersion,
                "iosMajorVersion": iosMajorVersion,
                "supportsNativeLiquidGlass": LiquidGlassTabBarView.supportsSystemLiquidGlass,
                "hasBiometrics": hasBiometrics,
                "biometricType": hasBiometrics ? biometricType : "none",
                "canEvaluateDeviceOwnerAuth": canEvaluateDeviceOwnerAuth
            ])
        }
    }

    @objc public func authenticateBiometric(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "افتح SmartSpend AI ببصمة الوجه أو الإصبع"
        let fallbackTitle = call.getString("fallbackTitle")
        let allowDevicePasscode = call.getBool("allowDevicePasscode", false)

        let context = LAContext()
        if let fallbackTitle = fallbackTitle {
            context.localizedFallbackTitle = fallbackTitle
        }

        let policy: LAPolicy = allowDevicePasscode
            ? .deviceOwnerAuthentication
            : .deviceOwnerAuthenticationWithBiometrics

        var canEvaluateError: NSError?
        guard context.canEvaluatePolicy(policy, error: &canEvaluateError) else {
            let mapped = Self.mapLAError(canEvaluateError)
            call.resolve([
                "success": false,
                "errorCode": mapped.code,
                "message": mapped.message
            ])
            return
        }

        context.evaluatePolicy(policy, localizedReason: reason) { success, authError in
            DispatchQueue.main.async {
                if success {
                    call.resolve([
                        "success": true
                    ])
                } else {
                    let mapped = Self.mapLAError(authError as NSError?)
                    call.resolve([
                        "success": false,
                        "errorCode": mapped.code,
                        "message": mapped.message
                    ])
                }
            }
        }
    }

    @objc public func triggerHaptic(_ call: CAPPluginCall) {
        let style = call.getString("style", "light").lowercased()

        DispatchQueue.main.async {
            switch style {
            case "light":
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.prepare()
                generator.impactOccurred()
            case "medium":
                let generator = UIImpactFeedbackGenerator(style: .medium)
                generator.prepare()
                generator.impactOccurred()
            case "heavy":
                let generator = UIImpactFeedbackGenerator(style: .heavy)
                generator.prepare()
                generator.impactOccurred()
            case "selection":
                let generator = UISelectionFeedbackGenerator()
                generator.prepare()
                generator.selectionChanged()
            case "success":
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.success)
            case "warning":
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.warning)
            case "error":
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.error)
            default:
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.prepare()
                generator.impactOccurred()
            }

            call.resolve(["triggered": true])
        }
    }

    private static func mapLAError(_ error: NSError?) -> (code: String, message: String) {
        guard let error = error else {
            return ("error", "فشل التحقق بالبصمة")
        }

        guard let laCode = LAError.Code(rawValue: error.code) else {
            return ("error", error.localizedDescription)
        }

        switch laCode {
        case .userCancel, .appCancel:
            return ("cancelled", "تم إلغاء التحقق بالبصمة")
        case .userFallback:
            return ("user_fallback", "تم اختيار وسيلة الدخول البديلة")
        case .systemCancel:
            return ("system_cancel", "توقف التحقق مؤقتاً من النظام")
        case .biometryNotAvailable:
            return ("biometry_not_available", "التحقق بالبصمة غير متاح على هذا الجهاز")
        case .biometryNotEnrolled:
            return ("biometry_not_enrolled", "لا توجد بصمة مسجلة على هذا الجهاز")
        case .biometryLockout:
            return ("biometry_lockout", "تم قفل البصمة مؤقتاً بعد عدة محاولات")
        case .passcodeNotSet:
            return ("passcode_not_set", "لم يتم إعداد رمز قفل للجهاز")
        case .authenticationFailed:
            return ("failed", "لم يتم التعرف على البصمة")
        default:
            return ("error", error.localizedDescription)
        }
    }
}
