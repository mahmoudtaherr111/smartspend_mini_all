import { describe, expect, it } from "vitest";
import { getPwaInstallPlatform } from "./install-platform";

describe("getPwaInstallPlatform", () => {
  it("recognizes iPhone and touch-capable iPadOS user agents", () => {
    expect(getPwaInstallPlatform("Mozilla/5.0 (iPhone)", 5)).toBe("ios");
    expect(getPwaInstallPlatform("Mozilla/5.0 (Macintosh)", 5)).toBe("ios");
  });

  it("separates Android from desktop installation guidance", () => {
    expect(getPwaInstallPlatform("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(
      "android",
    );
    expect(getPwaInstallPlatform("Mozilla/5.0 (Windows NT 10.0)", 0)).toBe(
      "desktop",
    );
  });
});
