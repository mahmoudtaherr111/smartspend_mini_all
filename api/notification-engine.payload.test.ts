import { describe, expect, it, vi } from "vitest";

vi.mock("./queries/connection", () => ({ db: {} }));
vi.mock("./services/firebase", () => ({ messaging: null, isFirebaseInitialized: false }));

const { fcmMessage, legacyPayload } = await import("./notification-engine");

const item = { title: "ميزانية أكل قربت تخلص", body: "صرفت 850 من 1,000 جنيه.", actionUrl: "/dashboard?tab=stats#budget", type: "budget_near_limit", lang: "ar" };

describe("what a push looks like on the phone", () => {
  it("shows the app icon and an alpha-only badge, never the logo as a big picture", () => {
    const message = fcmMessage("token", item);
    expect(message.notification).toEqual({ title: item.title, body: item.body });
    expect(message.webpush.notification.icon).toMatch(/\/icon-192\.png$/);
    expect(message.webpush.notification.badge).toMatch(/\/badge-96\.png$/);
    expect(JSON.stringify(message)).not.toContain("imageUrl");
  });

  it("groups by type, reads right to left in Arabic, and opens the destination", () => {
    const message = fcmMessage("token", item);
    expect(message.webpush.notification).toMatchObject({ tag: "budget_near_limit", dir: "rtl", lang: "ar" });
    expect(message.data).toEqual({ url: item.actionUrl, type: item.type });
    expect(message.webpush.fcmOptions.link).toBe(item.actionUrl);
    expect(fcmMessage("token", { ...item, lang: "en" }).webpush.notification.dir).toBe("ltr");
  });

  it("sends plain Web Push the same content", () => {
    expect(JSON.parse(legacyPayload(item))).toMatchObject({
      title: item.title,
      url: item.actionUrl,
      type: item.type,
      tag: item.type,
      dir: "rtl",
    });
  });
});
