import UIKit
import Capacitor

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    private let smartSpendBackground = UIColor(
        red: 9.0 / 255.0,
        green: 13.0 / 255.0,
        blue: 22.0 / 255.0,
        alpha: 1.0
    )

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LiquidGlassTabBarPlugin())
        bridge?.registerPluginInstance(SmartSpendNativePlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = smartSpendBackground
        webView?.isOpaque = false
        webView?.backgroundColor = smartSpendBackground
        webView?.scrollView.backgroundColor = smartSpendBackground
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.allowsBackForwardNavigationGestures = false
    }
}
