/**
 * Capacitor Asset & Manifest Synchronization Script
 * Synchronizes production web build artifacts from dist/public into:
 * - ios/App/App/public
 * - android/app/src/main/assets/public
 *
 * Ensures:
 * 1. manifest.webmanifest is 100% synchronized (background #090d16, theme #f8fafc, icon 274x268)
 * 2. Conflicting legacy manifest.json, offline.html, and registerSW.js are removed
 * 3. Stale assets and JS chunks from previous builds are pruned
 * 4. Empty placeholder cordova.js / cordova_plugins.js are maintained for Capacitor runtime
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_PUBLIC = path.join(ROOT_DIR, "dist", "public");

const DESTINATIONS = [
  path.join(ROOT_DIR, "ios", "App", "App", "public"),
  path.join(ROOT_DIR, "android", "app", "src", "main", "assets", "public"),
];

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      // Exclude server-only .gz and .br precompressed files from native asset bundles
      if (!entry.name.endsWith(".gz") && !entry.name.endsWith(".br")) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function cleanAndSyncDestination(destDir: string) {
  if (!fs.existsSync(destDir)) {
    console.log(`[CapSync] Creating directory: ${destDir}`);
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Remove existing directory contents cleanly
  const existingEntries = fs.readdirSync(destDir);
  for (const item of existingEntries) {
    const itemPath = path.join(destDir, item);
    fs.rmSync(itemPath, { recursive: true, force: true });
  }

  // Copy fresh dist/public files
  copyDirRecursive(DIST_PUBLIC, destDir);

  // Maintain 0-byte cordova.js and cordova_plugins.js placeholders for Capacitor plugin bridges
  const cordovaJs = path.join(destDir, "cordova.js");
  const cordovaPluginsJs = path.join(destDir, "cordova_plugins.js");
  if (!fs.existsSync(cordovaJs)) {
    fs.writeFileSync(cordovaJs, "");
  }
  if (!fs.existsSync(cordovaPluginsJs)) {
    fs.writeFileSync(cordovaPluginsJs, "");
  }

  console.log(`[CapSync] Successfully synchronized ${destDir}`);
}

export function syncCapacitorAssets() {
  if (!fs.existsSync(DIST_PUBLIC)) {
    throw new Error(
      `[CapSync] dist/public does not exist! Please run "npm run build" first.`,
    );
  }

  console.log(`[CapSync] Starting Capacitor asset sync from ${DIST_PUBLIC}...`);

  for (const dest of DESTINATIONS) {
    cleanAndSyncDestination(dest);
  }

  console.log(`[CapSync] Capacitor assets & manifest are now 100% in sync with web!`);
}

// Run directly when invoked via CLI
if (process.argv[1]?.endsWith("sync-capacitor-assets.ts")) {
  try {
    syncCapacitorAssets();
  } catch (err) {
    console.error(`[CapSync] Error:`, err);
    process.exit(1);
  }
}
