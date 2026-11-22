import Flutter
import UIKit

/// Flutter plugin registering the native iOS Liquid Glass control channel and
/// `ios_liquid_glass/tab_bar` [FlutterPlatformViewFactory].
public final class IosLiquidGlassPlugin: NSObject, FlutterPlugin {
    private static let controlChannelName = "com.smartspend.ios_liquid_glass/control"
    private static let tabBarViewType = "ios_liquid_glass/tab_bar"

    public static func register(with registrar: FlutterPluginRegistrar) {
        let controlChannel = FlutterMethodChannel(
            name: controlChannelName,
            binaryMessenger: registrar.messenger()
        )
        let instance = IosLiquidGlassPlugin()
        registrar.addMethodCallDelegate(instance, channel: controlChannel)

        let factory = LiquidGlassTabBarPlatformViewFactory(messenger: registrar.messenger())
        registrar.register(factory, withId: tabBarViewType)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "isNativeLiquidGlassAvailable":
            // Native UIKit glass is available on all supported iOS 15+ builds
            // (iOS 26 UIGlassEffect or iOS 15-18 UIBlurEffect material).
            result(true)
        case "supportsSystemGlassEffect":
            result(LiquidGlassTabBarView.supportsSystemLiquidGlass)
        default:
            result(FlutterMethodNotImplemented)
        }
    }
}
