/**
 * Test Suite for Self-Hosted Variable Fonts (Cairo & Inter)
 * Verifies dependencies, CSS imports, font-family fallback stacks,
 * absence of external CDN links, built font assets, and SW precaching.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_PUBLIC = path.resolve(ROOT_DIR, "dist/public");
const ASSETS_DIR = path.resolve(DIST_PUBLIC, "assets");

describe("Self-Hosted Variable Fonts Suite", () => {
  const packageJsonPath = path.resolve(ROOT_DIR, "package.json");
  const indexCssPath = path.resolve(ROOT_DIR, "src/index.css");
  const tailwindConfigPath = path.resolve(ROOT_DIR, "tailwind.config.js");
  const indexHtmlPath = path.resolve(ROOT_DIR, "index.html");

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const indexCss = fs.readFileSync(indexCssPath, "utf-8");
  const tailwindConfig = fs.readFileSync(tailwindConfigPath, "utf-8");
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

  describe("R1: Production Dependencies", () => {
    it("includes @fontsource-variable/cairo in package.json dependencies", () => {
      expect(packageJson.dependencies).toHaveProperty("@fontsource-variable/cairo");
      expect(packageJson.dependencies["@fontsource-variable/cairo"]).toBeTruthy();
    });

    it("includes @fontsource-variable/inter in package.json dependencies", () => {
      expect(packageJson.dependencies).toHaveProperty("@fontsource-variable/inter");
      expect(packageJson.dependencies["@fontsource-variable/inter"]).toBeTruthy();
    });

    it("verifies installed fontsource packages have required .woff2 files in node_modules", () => {
      const cairoFilesDir = path.resolve(ROOT_DIR, "node_modules/@fontsource-variable/cairo/files");
      const interFilesDir = path.resolve(ROOT_DIR, "node_modules/@fontsource-variable/inter/files");

      expect(fs.existsSync(cairoFilesDir)).toBe(true);
      expect(fs.existsSync(interFilesDir)).toBe(true);

      const cairoFiles = fs.readdirSync(cairoFilesDir);
      const interFiles = fs.readdirSync(interFilesDir);

      expect(cairoFiles).toContain("cairo-arabic-wght-normal.woff2");
      expect(cairoFiles).toContain("cairo-latin-wght-normal.woff2");
      expect(interFiles).toContain("inter-latin-wght-normal.woff2");
    });
  });

  describe("R2: Font Imports, Font Family Fallback Stacks & Weight Ranges", () => {
    it("imports @fontsource-variable/cairo at the top of src/index.css", () => {
      expect(indexCss).toMatch(/@import\s+["']@fontsource-variable\/cairo["'];/);
    });

    it("imports @fontsource-variable/inter at the top of src/index.css", () => {
      expect(indexCss).toMatch(/@import\s+["']@fontsource-variable\/inter["'];/);
    });

    it("configures font-family in src/index.css body rule with Cairo Variable, Inter Variable, Cairo, Inter", () => {
      expect(indexCss).toContain('"Cairo Variable"');
      expect(indexCss).toContain('"Inter Variable"');
      expect(indexCss).toContain('"Cairo"');
      expect(indexCss).toContain('"Inter"');
      expect(indexCss).toContain("system-ui");
      expect(indexCss).toContain("-apple-system");
      expect(indexCss).toContain("sans-serif");
    });

    it("configures fontFamily.sans in tailwind.config.js with variable font priority", () => {
      expect(tailwindConfig).toContain('"Cairo Variable"');
      expect(tailwindConfig).toContain('"Inter Variable"');
      expect(tailwindConfig).toContain('"Cairo"');
      expect(tailwindConfig).toContain('"Inter"');
      expect(tailwindConfig).toContain('"system-ui"');
      expect(tailwindConfig).toContain('"-apple-system"');
      expect(tailwindConfig).toContain('"sans-serif"');
    });

    it("verifies package font definitions define font-display: swap and expected weight ranges", () => {
      const cairoCss = fs.readFileSync(
        path.resolve(ROOT_DIR, "node_modules/@fontsource-variable/cairo/index.css"),
        "utf-8",
      );
      const interCss = fs.readFileSync(
        path.resolve(ROOT_DIR, "node_modules/@fontsource-variable/inter/index.css"),
        "utf-8",
      );

      // Cairo Variable weight range: 200 to 1000
      expect(cairoCss).toContain("font-weight: 200 1000");
      expect(cairoCss).toContain("font-display: swap");
      expect(cairoCss).toContain("U+0600-06FF"); // Arabic Unicode range

      // Inter Variable weight range: 100 to 900
      expect(interCss).toContain("font-weight: 100 900");
      expect(interCss).toContain("font-display: swap");
      expect(interCss).toContain("U+0000-00FF"); // Latin Unicode range
    });
  });

  describe("R3: Elimination of External Google Fonts CDN", () => {
    it("has zero preconnect links to fonts.googleapis.com or fonts.gstatic.com in index.html", () => {
      expect(indexHtml).not.toContain("fonts.googleapis.com");
      expect(indexHtml).not.toContain("fonts.gstatic.com");
    });

    it("has zero external stylesheet links to Google Fonts in index.html", () => {
      expect(indexHtml).not.toMatch(/<link[^>]*href=["'][^"']*fonts\.googleapis\.com/i);
    });
  });

  describe("R4: Build Artifacts & Offline PWA Precaching", () => {
    it("verifies compiled dist/public directory exists", () => {
      expect(fs.existsSync(DIST_PUBLIC)).toBe(true);
    });

    it("bundles Cairo and Inter .woff2 font files into dist/public/assets/", () => {
      expect(fs.existsSync(ASSETS_DIR)).toBe(true);

      const files = fs.readdirSync(ASSETS_DIR);
      const fontFiles = files.filter((f) => f.endsWith(".woff2"));

      expect(fontFiles.length).toBeGreaterThanOrEqual(2);

      const hasCairoArabic = fontFiles.some((f) => f.startsWith("cairo-arabic-"));
      const hasCairoLatin = fontFiles.some((f) => f.startsWith("cairo-latin-"));
      const hasInterLatin = fontFiles.some((f) => f.startsWith("inter-latin-"));

      expect(hasCairoArabic).toBe(true);
      expect(hasCairoLatin).toBe(true);
      expect(hasInterLatin).toBe(true);
    });

    it("verifies compiled CSS bundle contains @font-face rules with variable weight ranges", () => {
      expect(fs.existsSync(ASSETS_DIR)).toBe(true);

      const files = fs.readdirSync(ASSETS_DIR);
      const cssFiles = files.filter((f) => f.endsWith(".css") && !f.endsWith(".br") && !f.endsWith(".gz"));
      expect(cssFiles.length).toBeGreaterThan(0);

      const mainCssContent = fs.readFileSync(path.resolve(ASSETS_DIR, cssFiles[0]), "utf-8");

      expect(mainCssContent).toContain("Cairo Variable");
      expect(mainCssContent).toContain("Inter Variable");
      expect(mainCssContent).toContain("200 1000"); // Cairo variable weight range
      expect(mainCssContent).toContain("100 900");  // Inter variable weight range
    });

    it("verifies service worker (sw.js) precaches variable font assets for 100% offline access", () => {
      const swPath = path.resolve(DIST_PUBLIC, "sw.js");
      expect(fs.existsSync(swPath)).toBe(true);

      const swContent = fs.readFileSync(swPath, "utf-8");
      expect(swContent).toContain("cairo-arabic-");
      expect(swContent).toContain("inter-latin-");
    });
  });
});
