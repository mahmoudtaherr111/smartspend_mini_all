import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smartspend.app",
  appName: "SmartSpend AI",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 120,
      backgroundColor: "#090d16",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#090d16",
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
      accessoryBarVisible: false,
    },
  },
};

export default config;
