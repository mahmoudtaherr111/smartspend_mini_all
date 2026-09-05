import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("AI chatbot response resilience", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/ai/AIChatbot.tsx"),
    "utf8",
  );

  it("normalizes malformed quick-action payloads before rendering", () => {
    expect(source).toContain("Array.isArray(quickActions.data)");
    expect(source).toContain("quickActionItems.length > 0");
    expect(source).toContain("quickActionItems.map");
    expect(source).not.toContain("quickActions.data.map");
  });
});

describe("ad banner response resilience", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/ads/AdBanner.tsx"),
    "utf8",
  );

  it("normalizes malformed ad payloads before reading the first item", () => {
    expect(source).toContain("Array.isArray(ads.data)");
    expect(source).toContain("adItems.length === 0");
    expect(source).toContain("const ad = adItems[0]");
  });
});
