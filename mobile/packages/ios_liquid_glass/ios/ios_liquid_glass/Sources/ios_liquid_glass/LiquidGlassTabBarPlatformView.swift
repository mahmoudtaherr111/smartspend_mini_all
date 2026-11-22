import Flutter
import UIKit

// MARK: - Models

struct LiquidGlassTabItem: Equatable {
    let id: String
    let label: String
    let sfSymbol: String
    var badge: Int
}

struct LiquidGlassHotAction: Equatable {
    let id: String
    let label: String
    let sfSymbol: String
    let accessibilityLabel: String
}

enum LiquidGlassTheme: String {
    case dark
    case light
}

// MARK: - PlatformView Factory

final class LiquidGlassTabBarPlatformViewFactory: NSObject, FlutterPlatformViewFactory {
    private let messenger: FlutterBinaryMessenger

    init(messenger: FlutterBinaryMessenger) {
        self.messenger = messenger
        super.init()
    }

    func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
        return FlutterStandardMessageCodec.sharedInstance()
    }

    func create(
        withFrame frame: CGRect,
        viewIdentifier viewId: Int64,
        arguments args: Any?
    ) -> FlutterPlatformView {
        return LiquidGlassTabBarPlatformView(
            frame: frame,
            viewId: viewId,
            arguments: args as? [String: Any],
            messenger: messenger
        )
    }
}

// MARK: - PlatformView Host

/// Hosts [LiquidGlassTabBarView] inside Flutter's widget tree via `UiKitView`.
/// Because it lives inside the Flutter route hierarchy rather than on `UIWindow`,
/// root-navigator bottom sheets, dialogs, and the app lock naturally cover it.
final class LiquidGlassTabBarPlatformView: NSObject, FlutterPlatformView {
    private let containerView: UIView
    private let tabBarView: LiquidGlassTabBarView
    private let channel: FlutterMethodChannel

    init(
        frame: CGRect,
        viewId: Int64,
        arguments: [String: Any]?,
        messenger: FlutterBinaryMessenger
    ) {
        self.containerView = UIView(frame: frame)
        self.tabBarView = LiquidGlassTabBarView()
        self.channel = FlutterMethodChannel(
            name: "ios_liquid_glass/tab_bar_\(viewId)",
            binaryMessenger: messenger
        )
        super.init()

        containerView.backgroundColor = .clear
        containerView.isOpaque = false
        containerView.clipsToBounds = false
        containerView.addSubview(tabBarView)

        NSLayoutConstraint.activate([
            tabBarView.leadingAnchor.constraint(
                equalTo: containerView.leadingAnchor,
                constant: LiquidGlassTabBarView.horizontalInset
            ),
            tabBarView.trailingAnchor.constraint(
                equalTo: containerView.trailingAnchor,
                constant: -LiquidGlassTabBarView.horizontalInset
            ),
            tabBarView.bottomAnchor.constraint(
                equalTo: containerView.bottomAnchor,
                constant: -LiquidGlassTabBarView.bottomMargin
            ),
            tabBarView.topAnchor.constraint(
                greaterThanOrEqualTo: containerView.topAnchor,
                constant: 4
            ),
        ])

        tabBarView.onTabSelected = { [weak self] index, item in
            self?.channel.invokeMethod("onTabSelected", arguments: [
                "index": index,
                "id": item.id,
            ])
        }

        tabBarView.onHotActionPressed = { [weak self] action in
            self?.channel.invokeMethod("onHotActionPressed", arguments: [
                "id": action.id,
            ])
        }

        if let args = arguments {
            applyInitialConfiguration(args)
        }

        channel.setMethodCallHandler { [weak self] call, result in
            self?.handleMethodCall(call, result: result)
        }
    }

    deinit {
        channel.setMethodCallHandler(nil)
    }

    func view() -> UIView {
        return containerView
    }

    private func applyInitialConfiguration(_ args: [String: Any]) {
        let items = Self.parseItems(args["items"])
        let activeIndex = (args["activeIndex"] as? NSNumber)?.intValue ?? 0
        let theme = LiquidGlassTheme(rawValue: (args["theme"] as? String) ?? "dark") ?? .dark
        let rtl = (args["rtl"] as? Bool) ?? true
        let hotAction = Self.parseHotAction(args["hotAction"])

        tabBarView.configure(
            items: items,
            activeIndex: activeIndex,
            hotAction: hotAction,
            theme: theme,
            rtl: rtl
        )
    }

    private func handleMethodCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        let args = call.arguments as? [String: Any] ?? [:]

        switch call.method {
        case "updateItems":
            let items = Self.parseItems(args["items"])
            let activeIndex = (args["activeIndex"] as? NSNumber)?.intValue ?? tabBarView.activeIndex
            let hotAction = Self.parseHotAction(args["hotAction"])
            tabBarView.updateItems(items: items, activeIndex: activeIndex, hotAction: hotAction)
            result(nil)

        case "setActiveIndex":
            if let index = (args["index"] as? NSNumber)?.intValue {
                let animated = (args["animated"] as? Bool) ?? true
                tabBarView.setActiveIndex(index, animated: animated)
            }
            result(nil)

        case "setTheme":
            let themeRaw = (args["theme"] as? String) ?? "dark"
            let theme = LiquidGlassTheme(rawValue: themeRaw) ?? .dark
            let animated = (args["animated"] as? Bool) ?? true
            tabBarView.applyTheme(theme, animated: animated)
            result(nil)

        case "setLocale":
            let rtl = (args["rtl"] as? Bool) ?? true
            tabBarView.applyDirection(rtl: rtl)
            result(nil)

        case "setBadge":
            if let id = args["id"] as? String {
                let count = (args["count"] as? NSNumber)?.intValue ?? 0
                tabBarView.setBadge(id: id, count: max(0, count))
            }
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private static func parseItems(_ raw: Any?) -> [LiquidGlassTabItem] {
        guard let list = raw as? [[String: Any]] else { return [] }
        return list.compactMap { dict in
            guard let id = dict["id"] as? String, !id.isEmpty else { return nil }
            let label = (dict["label"] as? String) ?? id
            let sfSymbol = (dict["sfSymbol"] as? String) ?? "circle.fill"
            let badge = (dict["badge"] as? NSNumber)?.intValue ?? 0
            return LiquidGlassTabItem(
                id: id,
                label: label,
                sfSymbol: sfSymbol,
                badge: max(0, badge)
            )
        }
    }

    private static func parseHotAction(_ raw: Any?) -> LiquidGlassHotAction? {
        guard let dict = raw as? [String: Any],
              let id = dict["id"] as? String,
              !id.isEmpty
        else {
            return nil
        }
        let label = (dict["label"] as? String) ?? ""
        let sfSymbol = (dict["sfSymbol"] as? String) ?? "mic.fill"
        let a11y = (dict["accessibilityLabel"] as? String) ?? (label.isEmpty ? id : label)
        return LiquidGlassHotAction(
            id: id,
            label: label,
            sfSymbol: sfSymbol,
            accessibilityLabel: a11y
        )
    }
}

// MARK: - Individual Tab Slot View

private final class LiquidGlassTabSlotView: UIControl {
    let itemId: String

    private let contentStack = UIStackView()
    private let iconContainer = UIView()
    private let iconImageView = UIImageView()
    private let titleLabel = UILabel()
    private let badgeLabel = UILabel()

    private var badgeCount = 0

    init(item: LiquidGlassTabItem, theme: LiquidGlassTheme) {
        self.itemId = item.id
        self.badgeCount = item.badge
        super.init(frame: .zero)

        isAccessibilityElement = true
        accessibilityTraits = [.button]
        accessibilityLabel = item.label
        accessibilityIdentifier = "native-tab-\(item.id)"

        setupViews(item: item)
        updateAppearance(selected: false, theme: theme, animated: false)
        setBadge(item.badge)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupViews(item: LiquidGlassTabItem) {
        contentStack.axis = .vertical
        contentStack.alignment = .center
        contentStack.distribution = .fill
        contentStack.spacing = 2
        contentStack.isUserInteractionEnabled = false
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(contentStack)

        iconContainer.isUserInteractionEnabled = false
        iconContainer.translatesAutoresizingMaskIntoConstraints = false

        let symbolConfig = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
        let image = UIImage(systemName: item.sfSymbol, withConfiguration: symbolConfig)
            ?? UIImage(systemName: "circle.fill", withConfiguration: symbolConfig)
        iconImageView.image = image
        iconImageView.contentMode = .scaleAspectFit
        iconImageView.translatesAutoresizingMaskIntoConstraints = false
        iconContainer.addSubview(iconImageView)

        badgeLabel.font = UIFont.systemFont(ofSize: 9.5, weight: .bold)
        badgeLabel.textColor = .white
        badgeLabel.textAlignment = .center
        badgeLabel.backgroundColor = UIColor(red: 239.0 / 255.0, green: 68.0 / 255.0, blue: 68.0 / 255.0, alpha: 1.0)
        badgeLabel.layer.cornerRadius = 8
        badgeLabel.layer.masksToBounds = true
        badgeLabel.isHidden = true
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        iconContainer.addSubview(badgeLabel)

        titleLabel.text = item.label
        titleLabel.font = UIFont.systemFont(ofSize: 10.5, weight: .medium)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 1
        titleLabel.adjustsFontSizeToFitWidth = true
        titleLabel.minimumScaleFactor = 0.72
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        contentStack.addArrangedSubview(iconContainer)
        contentStack.addArrangedSubview(titleLabel)

        NSLayoutConstraint.activate([
            contentStack.centerXAnchor.constraint(equalTo: centerXAnchor),
            contentStack.centerYAnchor.constraint(equalTo: centerYAnchor),
            contentStack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 2),
            contentStack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -2),

            iconContainer.widthAnchor.constraint(equalToConstant: 26),
            iconContainer.heightAnchor.constraint(equalToConstant: 24),

            iconImageView.centerXAnchor.constraint(equalTo: iconContainer.centerXAnchor),
            iconImageView.centerYAnchor.constraint(equalTo: iconContainer.centerYAnchor),
            iconImageView.widthAnchor.constraint(equalToConstant: 21),
            iconImageView.heightAnchor.constraint(equalToConstant: 21),

            badgeLabel.topAnchor.constraint(equalTo: iconContainer.topAnchor, constant: -3),
            badgeLabel.trailingAnchor.constraint(equalTo: iconContainer.trailingAnchor, constant: 6),
            badgeLabel.heightAnchor.constraint(equalToConstant: 16),
            badgeLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 16),
        ])
    }

    func updateAppearance(selected: Bool, theme: LiquidGlassTheme, animated: Bool) {
        accessibilityTraits = selected ? [.button, .selected] : [.button]

        let activeColor = theme == .dark
            ? UIColor(red: 52.0 / 255.0, green: 211.0 / 255.0, blue: 153.0 / 255.0, alpha: 1.0)
            : UIColor(red: 4.0 / 255.0, green: 120.0 / 255.0, blue: 87.0 / 255.0, alpha: 1.0)

        let inactiveColor = theme == .dark
            ? UIColor(red: 161.0 / 255.0, green: 161.0 / 255.0, blue: 170.0 / 255.0, alpha: 0.94)
            : UIColor(red: 95.0 / 255.0, green: 96.0 / 255.0, blue: 104.0 / 255.0, alpha: 0.94)

        let targetColor = selected ? activeColor : inactiveColor
        let targetFont = UIFont.systemFont(ofSize: 10.5, weight: selected ? .bold : .medium)
        let targetScale: CGFloat = selected ? 1.05 : 1.0

        let apply = {
            self.iconImageView.tintColor = targetColor
            self.titleLabel.textColor = targetColor
            self.titleLabel.font = targetFont
            self.iconImageView.transform = CGAffineTransform(scaleX: targetScale, y: targetScale)
        }

        if animated {
            UIView.animate(
                withDuration: 0.22,
                delay: 0,
                usingSpringWithDamping: 0.78,
                initialSpringVelocity: 0.4,
                options: [.allowUserInteraction, .beginFromCurrentState],
                animations: apply
            )
        } else {
            apply()
        }
    }

    func setPressed(_ pressed: Bool) {
        UIView.animate(
            withDuration: 0.16,
            delay: 0,
            usingSpringWithDamping: 0.8,
            initialSpringVelocity: 0.5,
            options: [.allowUserInteraction, .beginFromCurrentState]
        ) {
            self.contentStack.transform = pressed
                ? CGAffineTransform(scaleX: 0.92, y: 0.92)
                : .identity
        }
    }

    func setBadge(_ count: Int) {
        badgeCount = max(0, count)
        if badgeCount <= 0 {
            badgeLabel.isHidden = true
            badgeLabel.text = nil
        } else {
            badgeLabel.isHidden = false
            badgeLabel.text = badgeCount > 99 ? " 99+ " : " \(badgeCount) "
        }
    }
}

// MARK: - Detached Floating Hot-Action Glass Button

private final class LiquidGlassHotButton: UIControl {
    private let shadowWrapper = UIView()
    private let glassView = UIVisualEffectView(effect: nil)
    private let tintOverlay = UIView()
    private let specularRimLayer = CAGradientLayer()
    private let iconImageView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setup() {
        isAccessibilityElement = true
        accessibilityTraits = [.button]

        shadowWrapper.isUserInteractionEnabled = false
        shadowWrapper.translatesAutoresizingMaskIntoConstraints = false
        addSubview(shadowWrapper)

        glassView.isUserInteractionEnabled = false
        glassView.layer.cornerRadius = 28
        glassView.layer.cornerCurve = .continuous
        glassView.clipsToBounds = true
        glassView.translatesAutoresizingMaskIntoConstraints = false
        shadowWrapper.addSubview(glassView)

        tintOverlay.isUserInteractionEnabled = false
        tintOverlay.translatesAutoresizingMaskIntoConstraints = false
        glassView.contentView.addSubview(tintOverlay)

        specularRimLayer.startPoint = CGPoint(x: 0.5, y: 0.0)
        specularRimLayer.endPoint = CGPoint(x: 0.5, y: 1.0)
        glassView.contentView.layer.addSublayer(specularRimLayer)

        iconImageView.contentMode = .scaleAspectFit
        iconImageView.isUserInteractionEnabled = false
        iconImageView.translatesAutoresizingMaskIntoConstraints = false
        glassView.contentView.addSubview(iconImageView)

        NSLayoutConstraint.activate([
            shadowWrapper.topAnchor.constraint(equalTo: topAnchor),
            shadowWrapper.bottomAnchor.constraint(equalTo: bottomAnchor),
            shadowWrapper.leadingAnchor.constraint(equalTo: leadingAnchor),
            shadowWrapper.trailingAnchor.constraint(equalTo: trailingAnchor),

            glassView.topAnchor.constraint(equalTo: shadowWrapper.topAnchor),
            glassView.bottomAnchor.constraint(equalTo: shadowWrapper.bottomAnchor),
            glassView.leadingAnchor.constraint(equalTo: shadowWrapper.leadingAnchor),
            glassView.trailingAnchor.constraint(equalTo: shadowWrapper.trailingAnchor),

            tintOverlay.topAnchor.constraint(equalTo: glassView.contentView.topAnchor),
            tintOverlay.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor),
            tintOverlay.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor),
            tintOverlay.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor),

            iconImageView.centerXAnchor.constraint(equalTo: glassView.contentView.centerXAnchor),
            iconImageView.centerYAnchor.constraint(equalTo: glassView.contentView.centerYAnchor),
            iconImageView.widthAnchor.constraint(equalToConstant: 23),
            iconImageView.heightAnchor.constraint(equalToConstant: 23),
        ])

        addTarget(self, action: #selector(handleTouchDown), for: [.touchDown, .touchDragEnter])
        addTarget(
            self,
            action: #selector(handleTouchUp),
            for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit]
        )
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let radius = bounds.height / 2.0
        glassView.layer.cornerRadius = radius
        specularRimLayer.frame = glassView.bounds
        specularRimLayer.cornerRadius = radius
        shadowWrapper.layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: radius).cgPath
    }

    func configure(action: LiquidGlassHotAction, theme: LiquidGlassTheme) {
        accessibilityLabel = action.accessibilityLabel
        accessibilityIdentifier = "native-hot-action-\(action.id)"

        let symbolConfig = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
        let image = UIImage(systemName: action.sfSymbol, withConfiguration: symbolConfig)
            ?? UIImage(systemName: "mic.fill", withConfiguration: symbolConfig)
        iconImageView.image = image
        applyTheme(theme)
    }

    func applyTheme(_ theme: LiquidGlassTheme) {
        overrideUserInterfaceStyle = theme == .dark ? .dark : .light

        let emerald = UIColor(red: 16.0 / 255.0, green: 185.0 / 255.0, blue: 129.0 / 255.0, alpha: 1.0)
        iconImageView.tintColor = .white

        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            // Let UIGlassEffect own the native specular rim and elevation (no double border/shadow).
            let effect = UIGlassEffect(style: .regular)
            effect.isInteractive = true
            effect.tintColor = emerald.withAlphaComponent(theme == .dark ? 0.68 : 0.78)
            glassView.effect = effect
            tintOverlay.backgroundColor = .clear
            specularRimLayer.isHidden = true
            glassView.layer.borderWidth = 0
            glassView.layer.borderColor = nil
            shadowWrapper.layer.shadowOpacity = 0
            return
        }
        #endif

        applyFallbackGlass(theme: theme, emerald: emerald)
    }

    private func applyFallbackGlass(theme: LiquidGlassTheme, emerald: UIColor) {
        let blurStyle: UIBlurEffect.Style = theme == .dark ? .systemUltraThinMaterialDark : .systemUltraThinMaterialLight
        glassView.effect = UIBlurEffect(style: blurStyle)
        tintOverlay.backgroundColor = emerald.withAlphaComponent(theme == .dark ? 0.84 : 0.90)
        specularRimLayer.isHidden = false
        specularRimLayer.colors = [
            UIColor.white.withAlphaComponent(0.36).cgColor,
            UIColor.white.withAlphaComponent(0.05).cgColor,
            UIColor.clear.cgColor,
        ]
        glassView.layer.borderWidth = 1.0
        glassView.layer.borderColor = UIColor.white.withAlphaComponent(theme == .dark ? 0.28 : 0.55).cgColor
        shadowWrapper.layer.shadowColor = emerald.withAlphaComponent(theme == .dark ? 0.55 : 0.40).cgColor
        shadowWrapper.layer.shadowOpacity = theme == .dark ? 0.48 : 0.34
        shadowWrapper.layer.shadowRadius = 14
        shadowWrapper.layer.shadowOffset = CGSize(width: 0, height: 6)
    }

    @objc private func handleTouchDown() {
        UIView.animate(
            withDuration: 0.14,
            delay: 0,
            usingSpringWithDamping: 0.72,
            initialSpringVelocity: 0.6,
            options: [.allowUserInteraction, .beginFromCurrentState]
        ) {
            self.transform = CGAffineTransform(scaleX: 0.90, y: 0.90)
        }
    }

    @objc private func handleTouchUp() {
        UIView.animate(
            withDuration: 0.24,
            delay: 0,
            usingSpringWithDamping: 0.68,
            initialSpringVelocity: 0.5,
            options: [.allowUserInteraction, .beginFromCurrentState]
        ) {
            self.transform = .identity
        }
    }
}

// MARK: - Native Floating Liquid Glass Tab Bar View

final class LiquidGlassTabBarView: UIView {
    static let barHeight: CGFloat = 58.0
    static let bottomMargin: CGFloat = 8.0
    static let horizontalInset: CGFloat = 12.0
    static let hotButtonSize: CGFloat = 56.0
    static let elementSpacing: CGFloat = 10.0

    static var supportsSystemLiquidGlass: Bool {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            return true
        }
        #endif
        return false
    }

    var onTabSelected: ((Int, LiquidGlassTabItem) -> Void)?
    var onHotActionPressed: ((LiquidGlassHotAction) -> Void)?

    private(set) var activeIndex: Int = 0

    private let chromeStack = UIStackView()

    private let pillShadowView = UIView()
    private let pillGlassView = UIVisualEffectView(effect: nil)
    private let pillTintOverlay = UIView()
    private let pillSpecularTopRim = CAGradientLayer()

    private let activeIndicatorView = UIView()
    private let activeIndicatorSpecular = CAGradientLayer()
    private let tabsStackView = UIStackView()

    private let hotButton = LiquidGlassHotButton()

    private let selectionFeedback = UISelectionFeedbackGenerator()
    private let impactFeedback = UIImpactFeedbackGenerator(style: .medium)

    private var items: [LiquidGlassTabItem] = []
    private var slotViews: [LiquidGlassTabSlotView] = []
    private var hotAction: LiquidGlassHotAction?
    private var currentTheme: LiquidGlassTheme = .dark
    private var isRtl: Bool = true

    // Scrubbing state for fluid iOS Liquid Glass touch sliding across tabs
    private var isScrubbing = false
    private var scrubPreviewIndex: Int?
    private var lastScrubEndedAt: CFTimeInterval = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupHierarchy()
        setupScrubGesture()
        applyTheme(.dark, animated: false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupHierarchy() {
        backgroundColor = .clear
        isOpaque = false
        translatesAutoresizingMaskIntoConstraints = false

        chromeStack.axis = .horizontal
        chromeStack.alignment = .center
        chromeStack.distribution = .fill
        chromeStack.spacing = Self.elementSpacing
        chromeStack.translatesAutoresizingMaskIntoConstraints = false

        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            let containerEffect = UIGlassContainerEffect()
            containerEffect.spacing = Self.elementSpacing
            let container = UIVisualEffectView(effect: containerEffect)
            container.translatesAutoresizingMaskIntoConstraints = false
            addSubview(container)
            container.contentView.addSubview(chromeStack)

            NSLayoutConstraint.activate([
                container.topAnchor.constraint(equalTo: topAnchor),
                container.bottomAnchor.constraint(equalTo: bottomAnchor),
                container.leadingAnchor.constraint(equalTo: leadingAnchor),
                container.trailingAnchor.constraint(equalTo: trailingAnchor),

                chromeStack.topAnchor.constraint(equalTo: container.contentView.topAnchor),
                chromeStack.bottomAnchor.constraint(equalTo: container.contentView.bottomAnchor),
                chromeStack.leadingAnchor.constraint(equalTo: container.contentView.leadingAnchor),
                chromeStack.trailingAnchor.constraint(equalTo: container.contentView.trailingAnchor),
            ])
        } else {
            attachChromeStackDirectly()
        }
        #else
        attachChromeStackDirectly()
        #endif

        pillShadowView.translatesAutoresizingMaskIntoConstraints = false
        pillShadowView.backgroundColor = .clear
        pillShadowView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        pillShadowView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        pillGlassView.layer.cornerRadius = Self.barHeight / 2.0
        pillGlassView.layer.cornerCurve = .continuous
        pillGlassView.clipsToBounds = true
        pillGlassView.translatesAutoresizingMaskIntoConstraints = false
        pillShadowView.addSubview(pillGlassView)

        pillTintOverlay.isUserInteractionEnabled = false
        pillTintOverlay.translatesAutoresizingMaskIntoConstraints = false
        pillGlassView.contentView.addSubview(pillTintOverlay)

        pillSpecularTopRim.startPoint = CGPoint(x: 0.0, y: 0.5)
        pillSpecularTopRim.endPoint = CGPoint(x: 1.0, y: 0.5)
        pillGlassView.contentView.layer.addSublayer(pillSpecularTopRim)

        activeIndicatorView.isUserInteractionEnabled = false
        activeIndicatorView.layer.cornerRadius = (Self.barHeight - 8.0) / 2.0
        activeIndicatorView.layer.cornerCurve = .continuous
        activeIndicatorView.clipsToBounds = true
        pillGlassView.contentView.addSubview(activeIndicatorView)

        activeIndicatorSpecular.startPoint = CGPoint(x: 0.5, y: 0.0)
        activeIndicatorSpecular.endPoint = CGPoint(x: 0.5, y: 1.0)
        activeIndicatorView.layer.addSublayer(activeIndicatorSpecular)

        tabsStackView.axis = .horizontal
        tabsStackView.alignment = .fill
        tabsStackView.distribution = .fillEqually
        tabsStackView.spacing = 0
        tabsStackView.translatesAutoresizingMaskIntoConstraints = false
        pillGlassView.contentView.addSubview(tabsStackView)

        hotButton.translatesAutoresizingMaskIntoConstraints = false
        hotButton.isHidden = true
        hotButton.setContentHuggingPriority(.required, for: .horizontal)
        hotButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        hotButton.addTarget(self, action: #selector(handleHotButtonTapped), for: .touchUpInside)

        chromeStack.addArrangedSubview(pillShadowView)
        chromeStack.addArrangedSubview(hotButton)

        NSLayoutConstraint.activate([
            pillShadowView.heightAnchor.constraint(equalToConstant: Self.barHeight),

            pillGlassView.topAnchor.constraint(equalTo: pillShadowView.topAnchor),
            pillGlassView.bottomAnchor.constraint(equalTo: pillShadowView.bottomAnchor),
            pillGlassView.leadingAnchor.constraint(equalTo: pillShadowView.leadingAnchor),
            pillGlassView.trailingAnchor.constraint(equalTo: pillShadowView.trailingAnchor),

            pillTintOverlay.topAnchor.constraint(equalTo: pillGlassView.contentView.topAnchor),
            pillTintOverlay.bottomAnchor.constraint(equalTo: pillGlassView.contentView.bottomAnchor),
            pillTintOverlay.leadingAnchor.constraint(equalTo: pillGlassView.contentView.leadingAnchor),
            pillTintOverlay.trailingAnchor.constraint(equalTo: pillGlassView.contentView.trailingAnchor),

            tabsStackView.topAnchor.constraint(equalTo: pillGlassView.contentView.topAnchor, constant: 3),
            tabsStackView.bottomAnchor.constraint(equalTo: pillGlassView.contentView.bottomAnchor, constant: -3),
            tabsStackView.leadingAnchor.constraint(equalTo: pillGlassView.contentView.leadingAnchor, constant: 4),
            tabsStackView.trailingAnchor.constraint(equalTo: pillGlassView.contentView.trailingAnchor, constant: -4),

            hotButton.widthAnchor.constraint(equalToConstant: Self.hotButtonSize),
            hotButton.heightAnchor.constraint(equalToConstant: Self.hotButtonSize),
        ])
    }

    private func attachChromeStackDirectly() {
        addSubview(chromeStack)
        NSLayoutConstraint.activate([
            chromeStack.topAnchor.constraint(equalTo: topAnchor),
            chromeStack.bottomAnchor.constraint(equalTo: bottomAnchor),
            chromeStack.leadingAnchor.constraint(equalTo: leadingAnchor),
            chromeStack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
    }

    private func setupScrubGesture() {
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePillPan(_:)))
        pan.cancelsTouchesInView = false
        pillGlassView.addGestureRecognizer(pan)
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        let pillRadius = pillGlassView.bounds.height / 2.0
        pillGlassView.layer.cornerRadius = pillRadius
        pillShadowView.layer.shadowPath = UIBezierPath(
            roundedRect: pillShadowView.bounds,
            cornerRadius: pillRadius
        ).cgPath
        pillSpecularTopRim.frame = CGRect(
            x: 18,
            y: 0.5,
            width: max(0, pillGlassView.bounds.width - 36),
            height: 1.0
        )

        if !isScrubbing {
            positionIndicator(forIndex: activeIndex, animated: false)
        }
    }

    // MARK: - Public API

    func configure(
        items: [LiquidGlassTabItem],
        activeIndex: Int,
        hotAction: LiquidGlassHotAction?,
        theme: LiquidGlassTheme,
        rtl: Bool
    ) {
        self.currentTheme = theme
        self.isRtl = rtl
        applyDirection(rtl: rtl)
        updateItems(items: items, activeIndex: activeIndex, hotAction: hotAction)
        applyTheme(theme, animated: false)
    }

    func updateItems(
        items: [LiquidGlassTabItem],
        activeIndex: Int,
        hotAction: LiquidGlassHotAction?
    ) {
        self.items = items
        self.activeIndex = items.isEmpty ? 0 : min(max(0, activeIndex), items.count - 1)
        self.hotAction = hotAction

        for view in slotViews {
            tabsStackView.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
        slotViews.removeAll()

        for (index, item) in items.enumerated() {
            let slot = LiquidGlassTabSlotView(item: item, theme: currentTheme)
            slot.tag = index
            slot.addTarget(self, action: #selector(handleSlotTouchDown(_:)), for: .touchDown)
            slot.addTarget(
                self,
                action: #selector(handleSlotTouchUp(_:)),
                for: [.touchUpOutside, .touchCancel, .touchDragExit]
            )
            slot.addTarget(self, action: #selector(handleSlotTapped(_:)), for: .touchUpInside)
            tabsStackView.addArrangedSubview(slot)
            slotViews.append(slot)
        }

        if let action = hotAction {
            hotButton.isHidden = false
            hotButton.configure(action: action, theme: currentTheme)
        } else {
            hotButton.isHidden = true
        }

        updateTabStates(selectedIndex: self.activeIndex, animated: false)
        setNeedsLayout()
        layoutIfNeeded()
        positionIndicator(forIndex: self.activeIndex, animated: false)
    }

    func setActiveIndex(_ index: Int, animated: Bool) {
        guard !items.isEmpty else { return }
        let clamped = min(max(0, index), items.count - 1)
        activeIndex = clamped
        updateTabStates(selectedIndex: clamped, animated: animated)
        positionIndicator(forIndex: clamped, animated: animated)
    }

    func applyDirection(rtl: Bool) {
        isRtl = rtl
        let semantic: UISemanticContentAttribute = rtl ? .forceRightToLeft : .forceLeftToRight
        semanticContentAttribute = semantic
        chromeStack.semanticContentAttribute = semantic
        tabsStackView.semanticContentAttribute = semantic
        setNeedsLayout()
        layoutIfNeeded()
        if !isScrubbing {
            positionIndicator(forIndex: activeIndex, animated: false)
        }
    }

    func setBadge(id: String, count: Int) {
        if let index = items.firstIndex(where: { $0.id == id }) {
            items[index].badge = max(0, count)
            if index < slotViews.count {
                slotViews[index].setBadge(count)
            }
        }
    }

    func applyTheme(_ theme: LiquidGlassTheme, animated: Bool) {
        currentTheme = theme
        overrideUserInterfaceStyle = theme == .dark ? .dark : .light

        let apply = {
            var usingSystemGlass = false
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                usingSystemGlass = true
                // Let UIGlassEffect own the native specular rim and elevation (no double borders/shadows).
                let glass = UIGlassEffect(style: .regular)
                glass.isInteractive = true
                glass.tintColor = theme == .dark
                    ? UIColor(red: 15.0 / 255.0, green: 23.0 / 255.0, blue: 42.0 / 255.0, alpha: 0.28)
                    : UIColor.white.withAlphaComponent(0.26)
                self.pillGlassView.effect = glass
                self.pillTintOverlay.backgroundColor = .clear
                self.pillGlassView.layer.borderWidth = 0
                self.pillGlassView.layer.borderColor = nil
                self.pillSpecularTopRim.isHidden = true
                self.pillShadowView.layer.shadowOpacity = 0
            }
            #endif

            if !usingSystemGlass {
                self.applyFallbackPillStyle(theme: theme)
            }

            self.activeIndicatorView.backgroundColor = theme == .dark
                ? UIColor(red: 16.0 / 255.0, green: 185.0 / 255.0, blue: 129.0 / 255.0, alpha: 0.18)
                : UIColor.white.withAlphaComponent(0.72)
            self.activeIndicatorView.layer.borderWidth = usingSystemGlass ? 0 : 0.75
            self.activeIndicatorView.layer.borderColor = theme == .dark
                ? UIColor(red: 52.0 / 255.0, green: 211.0 / 255.0, blue: 153.0 / 255.0, alpha: 0.28).cgColor
                : UIColor.white.withAlphaComponent(0.85).cgColor

            self.activeIndicatorSpecular.isHidden = usingSystemGlass
            self.activeIndicatorSpecular.colors = [
                UIColor.white.withAlphaComponent(theme == .dark ? 0.18 : 0.55).cgColor,
                UIColor.clear.cgColor,
            ]

            self.hotButton.applyTheme(theme)
            self.updateTabStates(selectedIndex: self.scrubPreviewIndex ?? self.activeIndex, animated: false)
        }

        if animated {
            UIView.animate(withDuration: 0.22, animations: apply)
        } else {
            apply()
        }
    }

    private func applyFallbackPillStyle(theme: LiquidGlassTheme) {
        let blurStyle: UIBlurEffect.Style = theme == .dark ? .systemUltraThinMaterialDark : .systemUltraThinMaterialLight
        pillGlassView.effect = UIBlurEffect(style: blurStyle)
        pillTintOverlay.backgroundColor = theme == .dark
            ? UIColor(red: 15.0 / 255.0, green: 23.0 / 255.0, blue: 42.0 / 255.0, alpha: 0.58)
            : UIColor.white.withAlphaComponent(0.62)
        pillGlassView.layer.borderWidth = 1.0
        pillGlassView.layer.borderColor = UIColor.white.withAlphaComponent(theme == .dark ? 0.16 : 0.65).cgColor

        pillSpecularTopRim.isHidden = false
        pillSpecularTopRim.colors = [
            UIColor.clear.cgColor,
            UIColor.white.withAlphaComponent(theme == .dark ? 0.30 : 0.80).cgColor,
            UIColor.clear.cgColor,
        ]

        pillShadowView.layer.shadowColor = UIColor(red: 9.0 / 255.0, green: 13.0 / 255.0, blue: 22.0 / 255.0, alpha: 1.0).cgColor
        pillShadowView.layer.shadowOpacity = theme == .dark ? 0.44 : 0.18
        pillShadowView.layer.shadowRadius = 18
        pillShadowView.layer.shadowOffset = CGSize(width: 0, height: 8)
    }

    // MARK: - Selection & Indicator Geometry

    private func updateTabStates(selectedIndex: Int, animated: Bool) {
        for (idx, slot) in slotViews.enumerated() {
            slot.updateAppearance(selected: idx == selectedIndex, theme: currentTheme, animated: animated)
        }
    }

    private func indicatorFrame(forIndex index: Int) -> CGRect {
        guard index >= 0, index < slotViews.count else { return .zero }
        let slotFrame = slotViews[index].convert(slotViews[index].bounds, to: pillGlassView.contentView)
        guard slotFrame.width > 0 else { return .zero }
        return CGRect(
            x: slotFrame.minX + 1.0,
            y: 4.0,
            width: max(0, slotFrame.width - 2.0),
            height: max(0, pillGlassView.bounds.height - 8.0)
        )
    }

    private func positionIndicator(forIndex index: Int, animated: Bool) {
        let targetFrame = indicatorFrame(forIndex: index)
        guard targetFrame.width > 0 else {
            activeIndicatorView.isHidden = true
            return
        }

        activeIndicatorView.isHidden = false
        let updateFrame = {
            self.activeIndicatorView.frame = targetFrame
            self.activeIndicatorView.layer.cornerRadius = targetFrame.height / 2.0
            self.activeIndicatorSpecular.frame = self.activeIndicatorView.bounds
            self.activeIndicatorSpecular.cornerRadius = targetFrame.height / 2.0
        }

        if animated {
            UIView.animate(
                withDuration: 0.34,
                delay: 0,
                usingSpringWithDamping: 0.78,
                initialSpringVelocity: 0.6,
                options: [.allowUserInteraction, .beginFromCurrentState],
                animations: updateFrame
            )
        } else {
            updateFrame()
        }
    }

    private func commitSelection(at index: Int, emitHaptic: Bool) {
        guard index >= 0, index < items.count else { return }
        let item = items[index]
        activeIndex = index
        updateTabStates(selectedIndex: index, animated: true)
        positionIndicator(forIndex: index, animated: true)

        if emitHaptic {
            selectionFeedback.prepare()
            selectionFeedback.selectionChanged()
        }

        onTabSelected?(index, item)
    }

    // MARK: - Actions & Scrub Gesture

    @objc private func handleSlotTouchDown(_ sender: LiquidGlassTabSlotView) {
        sender.setPressed(true)
        selectionFeedback.prepare()
    }

    @objc private func handleSlotTouchUp(_ sender: LiquidGlassTabSlotView) {
        sender.setPressed(false)
    }

    @objc private func handleSlotTapped(_ sender: LiquidGlassTabSlotView) {
        sender.setPressed(false)
        guard !isScrubbing, (CACurrentMediaTime() - lastScrubEndedAt) > 0.12 else { return }
        commitSelection(at: sender.tag, emitHaptic: true)
    }

    @objc private func handleHotButtonTapped() {
        guard let action = hotAction else { return }
        impactFeedback.prepare()
        impactFeedback.impactOccurred()
        onHotActionPressed?(action)
    }

    @objc private func handlePillPan(_ gesture: UIPanGestureRecognizer) {
        guard !slotViews.isEmpty else { return }
        let location = gesture.location(in: pillGlassView.contentView)
        let translation = gesture.translation(in: pillGlassView.contentView)

        switch gesture.state {
        case .began:
            if abs(translation.x) >= abs(translation.y) {
                isScrubbing = true
                selectionFeedback.prepare()
            }
        case .changed:
            if !isScrubbing {
                if abs(translation.x) > 6 && abs(translation.x) > abs(translation.y) {
                    isScrubbing = true
                    selectionFeedback.prepare()
                } else {
                    return
                }
            }

            guard let closestIndex = closestSlotIndex(forX: location.x) else { return }
            let targetWidth = slotViews[closestIndex].bounds.width - 2.0
            let minX = 5.0
            let maxX = max(minX, pillGlassView.bounds.width - targetWidth - 5.0)
            let clampedX = min(maxX, max(minX, location.x - targetWidth / 2.0))

            UIView.animate(
                withDuration: 0.08,
                delay: 0,
                options: [.allowUserInteraction, .beginFromCurrentState]
            ) {
                self.activeIndicatorView.frame = CGRect(
                    x: clampedX,
                    y: 4.0,
                    width: max(0, targetWidth),
                    height: max(0, self.pillGlassView.bounds.height - 8.0)
                )
                self.activeIndicatorSpecular.frame = self.activeIndicatorView.bounds
            }

            if scrubPreviewIndex != closestIndex {
                scrubPreviewIndex = closestIndex
                updateTabStates(selectedIndex: closestIndex, animated: true)
                selectionFeedback.selectionChanged()
            }

        case .ended:
            if isScrubbing {
                let targetIndex = scrubPreviewIndex ?? closestSlotIndex(forX: location.x) ?? activeIndex
                isScrubbing = false
                scrubPreviewIndex = nil
                lastScrubEndedAt = CACurrentMediaTime()
                for slot in slotViews {
                    slot.setPressed(false)
                }
                commitSelection(at: targetIndex, emitHaptic: false)
            }

        case .cancelled, .failed:
            isScrubbing = false
            scrubPreviewIndex = nil
            for slot in slotViews {
                slot.setPressed(false)
            }
            updateTabStates(selectedIndex: activeIndex, animated: true)
            positionIndicator(forIndex: activeIndex, animated: true)

        default:
            break
        }
    }

    private func closestSlotIndex(forX x: CGFloat) -> Int? {
        var bestIndex: Int?
        var bestDistance = CGFloat.greatestFiniteMagnitude
        for (idx, slot) in slotViews.enumerated() {
            let rect = slot.convert(slot.bounds, to: pillGlassView.contentView)
            let distance = abs(x - rect.midX)
            if distance < bestDistance {
                bestDistance = distance
                bestIndex = idx
            }
        }
        return bestIndex
    }
}
