import { describe, expect, it } from "vitest";
import { readClient } from "./client-platform";

describe("readClient", () => {
  it("reads the platform and version the mobile app sends", () => {
    expect(readClient("SmartSpend-Mobile (android; production; 1.4.0)")).toEqual({ platform: "android", version: "1.4.0" });
    expect(readClient("SmartSpend-Mobile (ios; production; 2.0.1+7)")).toEqual({ platform: "ios", version: "2.0.1+7" });
  });

  it("accepts builds from before the version was sent", () => {
    expect(readClient("SmartSpend-Mobile (android; production)")).toEqual({ platform: "android", version: null });
  });

  it("calls any other agent the website, and nothing unknown", () => {
    expect(readClient("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)").platform).toBe("web");
    expect(readClient("").platform).toBe("unknown");
    expect(readClient(undefined).platform).toBe("unknown");
  });
});
