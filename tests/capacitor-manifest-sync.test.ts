/**
 * Vitest Test Suite for Capacitor Native Manifest & Asset Synchronization
 * Ensures that iOS and Android public assets match Web PWA standards bit-for-bit:
 * - background_color is #090d16 (not deprecated #0f172a)
 * - theme_color is #f8fafc (not deprecated #10b981)
 * - icon declarations match the physical square 192px and 512px assets
 * - No conflicting legacy manifest.json, offline.html, or registerSW.js exist
 * - Index.html theme colors and loaders are unified
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(__dirname, "..");
const IOS_PUBLIC = path.join(ROOT_DIR, "ios", "App", "App", "public");
const ANDROID_PUBLIC = path.join(
  ROOT_DIR,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "public",
);
const DIST_PUBLIC = path.join(ROOT_DIR, "dist", "public");

function readPngDimensions(filePath: string) {
  const png = fs.readFileSync(filePath);
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

describe("Capacitor Native Manifest & Asset Synchronization", () => {
  const nativePlatforms = [
    { name: "iOS", dir: IOS_PUBLIC },
    { name: "Android", dir: ANDROID_PUBLIC },
  ];

  nativePlatforms.forEach(({ name, dir }) => {
    describe(`${name} Capacitor Platform`, () => {
      it(`has manifest.webmanifest synchronized with #090d16 background and #f8fafc theme`, () => {
        const manifestPath = path.join(dir, "manifest.webmanifest");
        expect(
          fs.existsSync(manifestPath),
          `${manifestPath} should exist`,
        ).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.background_color).toBe("#090d16");
        expect(manifest.theme_color).toBe("#f8fafc");
        expect(manifest.display).toBe("standalone");
        expect(manifest.dir).toBe("rtl");
        expect(manifest.lang).toBe("ar");
      });

      it(`declares square install and maskable icons with truthful dimensions`, () => {
        const manifestPath = path.join(dir, "manifest.webmanifest");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

        expect(manifest.icons).toEqual([
          expect.objectContaining({
            src: "icon-192.png",
            sizes: "192x192",
            purpose: "any",
          }),
          expect.objectContaining({
            src: "icon-512.png",
            sizes: "512x512",
            purpose: "any",
          }),
          expect.objectContaining({
            src: "icon-512.png",
            sizes: "512x512",
            purpose: "maskable",
          }),
        ]);

        // A declaration is only valid when it matches the actual PNG dimensions.
        for (const icon of manifest.icons) {
          const [declaredWidth, declaredHeight] = icon.sizes
            .split("x")
            .map(Number);
          expect(readPngDimensions(path.join(dir, icon.src))).toEqual({
            width: declaredWidth,
            height: declaredHeight,
          });
        }

        const rawManifestText = fs.readFileSync(manifestPath, "utf-8");
        expect(rawManifestText).not.toContain("icon.png");
        expect(rawManifestText).not.toContain("274x268");
        expect(rawManifestText).not.toContain("#0f172a");
      });

      it(`does NOT contain legacy conflicting manifest.json, offline.html, or registerSW.js`, () => {
        const legacyManifest = path.join(dir, "manifest.json");
        const offlineHtml = path.join(dir, "offline.html");
        const registerSW = path.join(dir, "registerSW.js");

        expect(fs.existsSync(legacyManifest)).toBe(false);
        expect(fs.existsSync(offlineHtml)).toBe(false);
        expect(fs.existsSync(registerSW)).toBe(false);
      });

      it(`has index.html aligned with unified dark theme (#090d16) and light theme (#f8fafc)`, () => {
        const indexPath = path.join(dir, "index.html");
        expect(fs.existsSync(indexPath)).toBe(true);

        const html = fs.readFileSync(indexPath, "utf-8");
        expect(html).toContain('content="#090d16"');
        expect(html).toContain('content="#f8fafc"');
        expect(html).toContain("background: #090d16");
        expect(html).toContain("background: #f8fafc");

        // Old #0f172a should not exist in html meta tags
        expect(html).not.toMatch(/content="#0f172a"/);
        // External Google Font links should not exist
        expect(html).not.toContain("fonts.googleapis.com");
      });

      it(`contains placeholder cordova.js and cordova_plugins.js for Capacitor bridge compatibility`, () => {
        const cordovaJs = path.join(dir, "cordova.js");
        const cordovaPluginsJs = path.join(dir, "cordova_plugins.js");

        expect(fs.existsSync(cordovaJs)).toBe(true);
        expect(fs.existsSync(cordovaPluginsJs)).toBe(true);
      });
    });
  });

  it("manifest.webmanifest across iOS, Android, and dist/public have identical manifest schemas", () => {
    const distManifest = JSON.parse(
      fs.readFileSync(path.join(DIST_PUBLIC, "manifest.webmanifest"), "utf-8"),
    );
    const iosManifest = JSON.parse(
      fs.readFileSync(path.join(IOS_PUBLIC, "manifest.webmanifest"), "utf-8"),
    );
    const androidManifest = JSON.parse(
      fs.readFileSync(
        path.join(ANDROID_PUBLIC, "manifest.webmanifest"),
        "utf-8",
      ),
    );

    expect(iosManifest).toEqual(distManifest);
    expect(androidManifest).toEqual(distManifest);
  });
});
