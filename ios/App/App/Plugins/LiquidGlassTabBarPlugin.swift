import Foundation
import UIKit
import Capacitor

@objc(LiquidGlassTabBarPlugin)
public class LiquidGlassTabBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiquidGlassTabBarPlugin"
    public let jsName = "LiquidGlassTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMetrics", returnType: CAPPluginReturnPromise)
    ]

    private var overlayContainer: LiquidGlassOverlayContainerView?
    private var tabBarView: LiquidGlassTabBarView?

    deinit {
        let overlay = overlayContainer
        if Thread.isMainThread {
            overlay?.removeFromSuperview()
        } else {
            DispatchQueue.main.async {
                overlay?.removeFromSuperview()
            }
        }
    }

    // MARK: - View Hierarchy Mounting

    private func ensureMounted() -> LiquidGlassTabBarView? {
        if let existing = tabBarView, existing.superview != nil {
            return existing
        }

        guard let hostView = bridge?.viewController?.view else {
            return nil
        }

        let overlay = LiquidGlassOverlayContainerView()
        overlay.backgroundColor = .clear
        overlay.translatesAutoresizingMaskIntoConstraints = false

        let bar = LiquidGlassTabBarView()
        bar.onTabSelected = { [weak self] item in
            self?.notifyListeners("tabSelected", data: [
                "id": item.id,
                "route": item.route
            ])
        }
        bar.onHotActionPressed = { [weak self] action in
            self?.notifyListeners("hotActionPressed", data: [
                "id": action.id
            ])
        }

        overlay.tabBarView = bar
        overlay.addSubview(bar)
        hostView.addSubview(overlay)

        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: hostView.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: hostView.trailingAnchor),
            overlay.bottomAnchor.constraint(equalTo: hostView.bottomAnchor),
            overlay.topAnchor.constraint(equalTo: bar.topAnchor, constant: -16),

            bar.leadingAnchor.constraint(
                equalTo: overlay.safeAreaLayoutGuide.leadingAnchor,
                constant: LiquidGlassTabBarView.horizontalInset
            ),
            bar.trailingAnchor.constraint(
                equalTo: overlay.safeAreaLayoutGuide.trailingAnchor,
                constant: -LiquidGlassTabBarView.horizontalInset
            ),
            bar.bottomAnchor.constraint(
                equalTo: overlay.safeAreaLayoutGuide.bottomAnchor,
                constant: -LiquidGlassTabBarView.bottomMargin
            )
        ])

        overlayContainer = overlay
        tabBarView = bar
        return bar
    }

    private func buildMetricsPayload() -> [String: Any] {
        let safeBottom = bridge?.viewController?.view.safeAreaInsets.bottom ?? 0.0
        let height = Double(LiquidGlassTabBarView.barHeight)
        let bottomInset = Double(safeBottom + LiquidGlassTabBarView.bottomMargin)
        let totalHeight = height + bottomInset + 8.0
        let isVisible = tabBarView?.isCurrentlyVisible ?? false

        return [
            "height": height,
            "bottomInset": bottomInset,
            "totalHeight": totalHeight,
            "visible": isVisible,
            "usesNativeGlass": LiquidGlassTabBarView.supportsSystemLiquidGlass
        ]
    }

    private static func extractObjectArray(_ call: CAPPluginCall, key: String) -> [[String: Any]]? {
        if let jsObjects = call.getArray(key, JSObject.self) {
            return jsObjects.map { dict in
                var mapped: [String: Any] = [:]
                for (k, v) in dict {
                    mapped[k] = v
                }
                return mapped
            }
        }
        return call.options?[key] as? [[String: Any]]
    }

    private static func extractObject(_ call: CAPPluginCall, key: String) -> [String: Any]? {
        if let jsObj = call.getObject(key) {
            var mapped: [String: Any] = [:]
            for (k, v) in jsObj {
                mapped[k] = v
            }
            return mapped
        }
        return call.options?[key] as? [String: Any]
    }

    // MARK: - Plugin Methods

    @objc public func configure(_ call: CAPPluginCall) {
        let rawItems: [[String: Any]] =
            Self.extractObjectArray(call, key: "items")
            ?? Self.extractObjectArray(call, key: "tabs")
            ?? []

        let items: [LiquidGlassTabItem] = rawItems.compactMap { dict in
            guard let id = dict["id"] as? String, !id.isEmpty else { return nil }
            let label = dict["label"] as? String ?? id
            let route = dict["route"] as? String ?? "/dashboard"
            let sfSymbol = dict["sfSymbol"] as? String ?? "circle.fill"
            let badge: Int
            if let intBadge = dict["badge"] as? Int {
                badge = intBadge
            } else if let numBadge = dict["badge"] as? NSNumber {
                badge = numBadge.intValue
            } else {
                badge = 0
            }
            return LiquidGlassTabItem(
                id: id,
                label: label,
                route: route,
                sfSymbol: sfSymbol,
                badge: max(0, badge)
            )
        }

        let activeId = call.getString("activeId") ?? items.first?.id ?? ""
        let themeString = call.getString("theme", "dark")
        let theme = LiquidGlassTheme(rawValue: themeString) ?? .dark
        let rtl = call.getBool("rtl", true)
        let visible = call.getBool("visible")

        var hotAction: LiquidGlassHotAction?
        if let rawHot = Self.extractObject(call, key: "hotAction"),
           let hotId = rawHot["id"] as? String,
           !hotId.isEmpty {
            let hotLabel = rawHot["label"] as? String ?? ""
            let hotSymbol = rawHot["sfSymbol"] as? String ?? "mic.fill"
            let hotA11y = rawHot["accessibilityLabel"] as? String ?? (hotLabel.isEmpty ? hotId : hotLabel)
            hotAction = LiquidGlassHotAction(
                id: hotId,
                label: hotLabel,
                sfSymbol: hotSymbol,
                accessibilityLabel: hotA11y
            )
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin instance deallocated")
                return
            }
            guard let bar = self.ensureMounted() else {
                call.reject("Unable to mount LiquidGlassTabBar on view hierarchy")
                return
            }

            if let hostView = self.bridge?.viewController?.view,
               let overlay = self.overlayContainer {
                hostView.bringSubviewToFront(overlay)
            }

            bar.configure(
                items: items,
                activeId: activeId,
                hotAction: hotAction,
                theme: theme,
                rtl: rtl,
                visible: visible
            )

            call.resolve(self.buildMetricsPayload())
        }
    }

    @objc public func setActiveTab(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Missing required parameter: id")
            return
        }
        let animated = call.getBool("animated", true)

        DispatchQueue.main.async { [weak self] in
            self?.tabBarView?.setActiveTab(id: id, animated: animated)
            call.resolve(["activeId": id])
        }
    }

    @objc public func setVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible", true)
        let animated = call.getBool("animated", true)

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve(["visible": false])
                return
            }
            let bar = self.ensureMounted()
            if visible,
               let hostView = self.bridge?.viewController?.view,
               let overlay = self.overlayContainer {
                hostView.bringSubviewToFront(overlay)
            }
            bar?.setVisible(visible, animated: animated)
            call.resolve(["visible": visible])
        }
    }

    @objc public func setTheme(_ call: CAPPluginCall) {
        let themeString = call.getString("theme", "dark")
        let theme = LiquidGlassTheme(rawValue: themeString) ?? .dark

        DispatchQueue.main.async { [weak self] in
            self?.tabBarView?.applyTheme(theme, animated: true)
            call.resolve(["theme": theme.rawValue])
        }
    }

    @objc public func setBadge(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Missing required parameter: id")
            return
        }
        let count = max(0, call.getInt("count", 0))

        DispatchQueue.main.async { [weak self] in
            self?.tabBarView?.setBadge(id: id, count: count)
            call.resolve([
                "id": id,
                "count": count
            ])
        }
    }

    @objc public func getMetrics(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve([
                    "height": Double(LiquidGlassTabBarView.barHeight),
                    "bottomInset": Double(LiquidGlassTabBarView.bottomMargin),
                    "totalHeight": Double(LiquidGlassTabBarView.barHeight + LiquidGlassTabBarView.bottomMargin + 8.0),
                    "visible": false,
                    "usesNativeGlass": LiquidGlassTabBarView.supportsSystemLiquidGlass
                ])
                return
            }
            call.resolve(self.buildMetricsPayload())
        }
    }
}
