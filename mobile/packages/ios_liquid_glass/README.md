# ios_liquid_glass

Native iOS Liquid Glass floating tab bar (`FlutterPlatformView`) for SmartSpend:

- Uses Apple's real iOS 26 `UIGlassContainerEffect` + interactive `UIGlassEffect(style: .regular)` when built with Xcode 26 / Swift 6.2+ on iOS 26+, letting `UIGlassEffect` own native specular rim and elevation without double borders or shadows.
- Falls back cleanly to `UIBlurEffect(.systemUltraThinMaterialDark / .systemUltraThinMaterialLight)` + 1pt specular highlight rim on iOS 15–18.
- Renders inside Flutter's widget tree via `UiKitView(viewType: 'ios_liquid_glass/tab_bar')` so modal sheets (`showSmartSpendSheet` on the root navigator), dialogs, and the app lock always cover it cleanly.
- On Android, web, high-contrast mode, or headless widget tests, delegates immediately to the caller's `fallback` widget builder.
