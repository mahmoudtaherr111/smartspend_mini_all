import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CENTER_PATH,
  NOTIFICATION_TYPES,
  notificationKindOf,
  notificationType,
  resolveNotificationTarget,
} from "../contracts/notification-types";

describe("where a notification takes the user", () => {
  it("sends budgets to the statistics' budgets, plans to Pro, the biometric suggestion to Security", () => {
    expect(notificationType("budget_near_limit").destination).toBe("/dashboard?tab=stats#budget");
    expect(notificationType("budget_category_exceeded").destination).toBe("/dashboard?tab=stats#budget");
    expect(notificationType("subscription_ending").destination).toBe("/pro");
    expect(notificationType("biometric_suggestion").destination).toBe("/settings/security?highlight=biometric");
    expect(notificationType("coach_reminder").destination).toBe("/plan");
  });

  it("sends an unknown type to the notification center", () => {
    expect(notificationType("something_new").destination).toBe(NOTIFICATION_CENTER_PATH);
  });

  it("covers every type the engine sends", async () => {
    const { readFileSync } = await import("node:fs");
    const engine = readFileSync("api/notification-engine.ts", "utf8") + readFileSync("api/jobs/subscription-expiry-job.ts", "utf8");
    const sent = new Set([...engine.matchAll(/eventType: "([a-z_]+)"/g), ...engine.matchAll(/triggerEventNotification\(\s*"([a-z_]+)"/g)].map((m) => m[1]));
    for (const type of sent) expect(Object.keys(NOTIFICATION_TYPES)).toContain(type);
    expect(sent.size).toBeGreaterThan(5);
  });

  it("repairs destinations stored before the map and never leaves the app", () => {
    expect(resolveNotificationTarget("/#budget")).toBe("/dashboard?tab=stats#budget");
    expect(resolveNotificationTarget("/")).toBe(NOTIFICATION_CENTER_PATH);
    expect(resolveNotificationTarget("/settings/security?highlight=1")).toBe("/settings/security?highlight=biometric");
    expect(resolveNotificationTarget(null)).toBe(NOTIFICATION_CENTER_PATH);
    expect(resolveNotificationTarget("https://example.com")).toBe(NOTIFICATION_CENTER_PATH);
    expect(resolveNotificationTarget("//example.com")).toBe(NOTIFICATION_CENTER_PATH);
    expect(resolveNotificationTarget("/plan")).toBe("/plan");
  });

  it("reads the kind of a stored item from its destination", () => {
    expect(notificationKindOf("/#budget")).toBe("budget");
    expect(notificationKindOf("/dashboard?tab=record")).toBe("reminder");
    expect(notificationKindOf("/pro")).toBe("subscription");
    expect(notificationKindOf("/plan")).toBe("plan");
    expect(notificationKindOf("/settings/security?highlight=1")).toBe("security");
    expect(notificationKindOf("/")).toBe("general");
  });
});
