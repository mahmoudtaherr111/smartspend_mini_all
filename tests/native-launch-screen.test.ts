import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("native launch screen", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const loaderSource = readFileSync(
    resolve(process.cwd(), "src/pwa/register-sw.ts"),
    "utf8",
  );
  const capacitorConfig = readFileSync(
    resolve(process.cwd(), "capacitor.config.ts"),
    "utf8",
  );
  const splashGenerator = readFileSync(
    resolve(process.cwd(), "scripts/generate-pwa-splashes.ps1"),
    "utf8",
  );

  it("uses the real app icon and Arabic-first product identity", () => {
    expect(html).toContain('class="loader-logo-img"');
    expect(html).toContain('src="/icon-192.png"');
    expect(html).toContain('width="64"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain("SmartSpend AI");
    expect(html).toContain("مصاريفك أذكى");
  });

  it("does not show the legacy dollar spinner or endless launch animations", () => {
    expect(html).not.toContain("loader-glow-ring");
    expect(html).not.toContain("loader-logo-svg");
    expect(html).not.toContain("AI Assistant");
    expect(html).not.toContain("spin-glow");
    expect(html).not.toContain("pulse-glow");
    expect(html).not.toContain("float-logo");
  });

  it("respects reduced-motion preferences during app handoff", () => {
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
    expect(html).toMatch(/\.app-loader\s*\{\s*transition:\s*none;/);
  });

  it("never waits for fonts and caps the web launch surface at 1.2 seconds", () => {
    expect(loaderSource).not.toContain("document.fonts.ready");
    expect(loaderSource).toContain("fadeOutDuration: 120");
    expect(html).toMatch(
      /loader\.remove\(\);[\s\S]*}, 180\);[\s\S]*}, 1200\);/,
    );
    expect(capacitorConfig).toContain("launchFadeOutDuration: 120");
  });

  it("generates restrained high-resolution splash marks without a square halo", () => {
    expect(splashGenerator).toContain("$logoPixels = 240");
    expect(splashGenerator).toContain("$logoPixels = 160");
    expect(splashGenerator).toContain("$logoPixels = 208");
    expect(splashGenerator).toContain("$graphics.SetClip($path)");
    expect(splashGenerator).toContain("HighQualityBicubic");
  });
});
