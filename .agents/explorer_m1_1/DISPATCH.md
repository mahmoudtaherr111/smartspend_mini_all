# Dispatch — Explorer M1.1 (Capacitor Plugins, Config & BackButtonManager)

## Mission
Analyze exact implementation steps for:
- Registering missing Capacitor plugins (`@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/keyboard`, `@capacitor/app`) in `package.json`.
- Authoring root `capacitor.config.ts` with app ID `com.smartspend.app`, plugins configuration (`Keyboard: { resize: "body", accessoryBarVisible: false }`, `SplashScreen: { launchAutoHide: false }`, `StatusBar: { overlaysWebView: false }`).
- Creating `src/lib/back-button-manager.ts` with a LIFO priority stack for modals/drawers and Android hardware back button handler.

## References
- `e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md`
- `e:/smartspend_V1_fixed/PROJECT.md`
- `e:/smartspend_V1_fixed/.agents/explorer_survey_3/report.md`
- `e:/smartspend_V1_fixed/package.json`

Write detailed implementation blueprint in `e:/smartspend_V1_fixed/.agents/explorer_m1_1/report.md`.
