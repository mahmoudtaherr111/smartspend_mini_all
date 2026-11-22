# 0053: Unify Android and iOS on Flutter with platform-adaptive iOS Liquid Glass

Date: 2026-11-22
Status: accepted

## Context
After decision `0022` (Flutter mobile app) and decision `0050` (parking the web PWA in `src/`), Android moved onto
`mobile/` (`mobile/app/android/`, `.github/workflows/android-release.yml`) and gained every new capability:
the commitments ecosystem with real brand logos (decision `0051`), Understanding Engine v2 (decision `0052`),
the unified `RecordComposer`, Wallets v2, offline outbox, yearly insights, and hardware-backed `device_lock`.

iOS distribution, however, diverged: `.github/workflows/build-ios-ipa.yml` continued packaging the legacy Capacitor 8
shell (`ios/`) around parked `src/`. That split caused two severe problems:
- **Feature drift:** iOS users ran an outdated web bundle lacking commitments, Understanding Engine v2, and native
  Keychain/biometric lock (`device_lock`), while Google OAuth failed inside `WKWebView`.
- **Structural iOS UX collisions:** Capacitor's native `LiquidGlassTabBarPlugin` mounted on top of the `WKWebView`
  window so every bottom sheet/drawer opened behind the tab bar, while `WKWebView` keyboard resizing conflicted with
  `position: fixed` web shells and Vaul drawers.

Meanwhile, `docs/guides/mobile-design.md` Rule 14.2 previously prohibited glass surfaces across both platforms to
protect low-end Android frame rates, leaving Flutter iOS without the Liquid Glass visual language users expect on
modern iOS.

## Decision
1. **One unified Flutter mobile app for Android and iOS (`mobile/app/`).**
   - Both platforms ship from the single Dart codebase in `mobile/`, sharing all 24 feature modules, generated tRPC
     procedures (`procedures.g.dart`), `device_lock` (Keychain/Keystore cryptographic biometrics, app-switcher cover,
     and screen-recording protection), and native store billing (`in_app_purchase`).
   - `.github/workflows/ios-release.yml` becomes the authoritative iOS IPA workflow (supporting both unsigned sideload
     IPAs via `ditto`/`zip -qry` and signed App Store / TestFlight archives). The legacy Capacitor `ios/` shell and
     `.github/workflows/build-ios-ipa.yml` are deprecated and no longer the shipping iOS product.
2. **Platform-adaptive iOS Liquid Glass.**
   - **Native iOS 26 `UIGlassEffect` tab bar inside Flutter:** `mobile/packages/ios_liquid_glass` wraps Apple's native
     `UIGlassEffect` / `UIGlassContainerEffect` (with `UIBlurEffect` fallback on iOS 15–18) as a Flutter `UiKitView`
     mounted through `SmartSpendNavigationBar.iosNativeBarBuilder`. Because it lives inside `AppShell`'s widget tree
     rather than a `UIWindow` overlay above Flutter, root-navigator `showSmartSpendSheet` modals, dialogs, lock screens,
     and the software keyboard automatically layer cleanly over or around the tab bar with zero z-order collisions.
   - **Pure-Flutter Impeller Liquid Glass primitives in `smartspend_ui`:** `SmartSpendGlassSurface`,
     `SmartSpendGlassAppBar`, `SmartSpendGlassDock`, `SmartSpendKeyboardAccessory`, Liquid Glass `showSmartSpendSheet`,
     and `SmartSpendIosGlassNavigationBar` provide cohesive frosted glass (`BackdropFilter` + translucent surface tint
     + specular rim) across iOS 15–26 while automatically falling back to solid high-contrast surfaces when
     `MediaQuery.highContrastOf(context)` is enabled.
3. **Solid, fast surfaces on Android.**
   - On Android (88–91% of Egypt's user base, heavily mid-range and budget hardware), every glass primitive renders a
     crisp opaque `SmartSpendColors` surface separated by hairline `outlineVariant` borders with zero `BackdropFilter`
     blur passes, preserving 60/120 Hz frame budgets.
4. **Centralized sheet safe areas, keyboard accessories, and RTL fidelity.**
   - `showSmartSpendSheet` centrally wraps all sheet bodies in `SafeArea(top: false)`, provides opt-in `scrollable`
     height clamping, and lifts/strips `viewInsets.bottom` once.
   - `SmartSpendKeyboardAccessory` provides an iOS "Done" toolbar for numeric and phone keyboards without altering
     Android.
   - Directional icons rely on Flutter's built-in `matchTextDirection` mirroring instead of manual `Transform.scale`
     wrappers that previously double-flipped chevrons in Arabic RTL.

## Consequences
- Android and iOS stay at 100% feature parity automatically on every pull request with one test suite and one API
  contract.
- iOS gains genuine native Liquid Glass chrome, native Cupertino gestures, hardware Keychain security, and clean
  keyboard/sheet layering without sacrificing Android performance.
- All glass styling lives inside `mobile/packages/smartspend_ui/` (and `mobile/packages/ios_liquid_glass/`), keeping
  feature screens free of raw design values (`mobile/app/test/design_tokens_test.dart`).
