import { describe, expect, it } from "vitest";
import { detectMobileDevice } from "./BankSyncPage";

describe("detectMobileDevice", () => {
  it("routes iPhone and iPad users to the iOS setup", () => {
    expect(detectMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectMobileDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
  });

  it("routes Android users to the companion setup and leaves desktop undecided", () => {
    expect(detectMobileDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(detectMobileDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBeNull();
  });
});
