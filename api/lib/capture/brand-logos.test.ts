import { describe, expect, it } from "vitest";
import { BRAND_LOGO_FILE, imageKind, imageWidth, isPublicHost, logoOf, playIconFrom, siteIconsFrom } from "./brand-logos";

describe("service logos", () => {
  it("takes the app icon from a Google Play listing, asked for at 256 px", () => {
    const html = '<meta property="og:image" content="https://play-lh.googleusercontent.com/abcDEF_123=w240-h480-rw">';
    expect(playIconFrom(html)).toBe("https://play-lh.googleusercontent.com/abcDEF_123=s256");
    expect(playIconFrom('<meta property="og:image" content="https://evil.example/x.png">')).toBeNull();
  });

  it("prefers a site's apple-touch-icon, skips SVG, and falls back to the usual paths", () => {
    const html = `<link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="mask-icon" href="/mask.svg">
      <link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="apple-touch-icon" href="/touch.png">`;
    expect(siteIconsFrom(html, "https://shahid.mbc.net/ar")).toEqual([
      "https://shahid.mbc.net/touch.png",
      "https://shahid.mbc.net/favicon-32.png",
      "https://shahid.mbc.net/apple-touch-icon.png",
      "https://shahid.mbc.net/favicon.ico",
    ]);
  });

  it("keeps only real raster images", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(imageKind(png)?.ext).toBe("png");
    expect(imageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"))).toBeNull();
    expect(imageKind(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
  });

  it("fetches only from public hosts", () => {
    expect(isPublicHost("play.google.com")).toBe(true);
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "db.internal", "printer.local", "[::1]", "metadata"]) {
      expect(isPublicHost(host)).toBe(false);
    }
  });

  it("serves only files it named, and the admin's own logo wins", () => {
    expect(BRAND_LOGO_FILE.test("netflix-0123456789ab.png")).toBe(true);
    expect(BRAND_LOGO_FILE.test("../secrets.png")).toBe(false);
    expect(BRAND_LOGO_FILE.test("netflix-0123456789ab.svg")).toBe(false);
    expect(logoOf({ logoUrl: "https://cdn/x.png", fetchedLogoUrl: "/api/brand-logos/a.png" })).toBe("https://cdn/x.png");
    expect(logoOf({ logoUrl: null, fetchedLogoUrl: "/api/brand-logos/a.png" })).toBe("/api/brand-logos/a.png");
  });

  it("reads an image's width, so a blurred favicon loses to a sharp icon", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 256);
    expect(imageWidth(png)).toBe(256);
    const ico = new Uint8Array([0, 0, 1, 0, 2, 0, 16, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 48, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageWidth(ico)).toBe(48);
    expect(imageWidth(new TextEncoder().encode("<html></html>"))).toBe(0);
  });
});
