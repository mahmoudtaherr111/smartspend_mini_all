import { describe, it, expect } from "vitest";
import { BOTTOM_NAV_ROUTES, getAppContentMode, hasBottomNav } from "./App";

describe("App Bottom Navigation Routing", () => {
  it("includes all 7 expected bottom nav routes in BOTTOM_NAV_ROUTES", () => {
    expect(BOTTOM_NAV_ROUTES).toContain("/dashboard");
    expect(BOTTOM_NAV_ROUTES).toContain("/ai");
    expect(BOTTOM_NAV_ROUTES).toContain("/settings");
    expect(BOTTOM_NAV_ROUTES).toContain("/support");
    expect(BOTTOM_NAV_ROUTES).toContain("/pro");
    expect(BOTTOM_NAV_ROUTES).toContain("/bank-sync");
    expect(BOTTOM_NAV_ROUTES).toContain("/more");
    expect(BOTTOM_NAV_ROUTES.length).toBe(7);
  });

  it("gives AI routes a fixed workspace while regular pages keep shell scrolling", () => {
    expect(getAppContentMode("/ai")).toBe("workspace");
    expect(getAppContentMode("/ai/conversation/42")).toBe("workspace");
    expect(getAppContentMode("/dashboard")).toBe("document");
    expect(getAppContentMode("/settings/security")).toBe("document");
  });

  it("identifies bottom nav routes correctly with hasBottomNav", () => {
    expect(hasBottomNav("/dashboard")).toBe(true);
    expect(hasBottomNav("/dashboard?tab=stats")).toBe(true);
    expect(hasBottomNav("/ai")).toBe(true);
    expect(hasBottomNav("/settings")).toBe(true);
    expect(hasBottomNav("/settings/security")).toBe(false);
    expect(hasBottomNav("/support")).toBe(true);
    expect(hasBottomNav("/pro")).toBe(true);
    expect(hasBottomNav("/bank-sync")).toBe(true);
    expect(hasBottomNav("/more")).toBe(true);
  });

  it("returns false for non-bottom nav routes", () => {
    expect(hasBottomNav("/")).toBe(false);
    expect(hasBottomNav("/login")).toBe(false);
    expect(hasBottomNav("/admin")).toBe(false);
    expect(hasBottomNav("/privacy")).toBe(false);
    expect(hasBottomNav("/terms")).toBe(false);
  });
});
