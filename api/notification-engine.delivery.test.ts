import { describe, expect, it } from "vitest";
import { fcmMessage, legacyPayload } from "./notification-engine";

describe("Notification Delivery Engine (DEBT-12)", () => {
  const samplePush = {
    title: "تنبيه الميزانية",
    body: "وصلت إلى 80% من ميزانية الأكل والشرب لهذا الشهر",
    actionUrl: "/budgets",
    type: "budget_warning",
    lang: "ar",
  };

  it("formats fcmMessage with correct apns, webpush, and data payload", () => {
    const msg = fcmMessage("sample-fcm-token-12345", samplePush);

    expect(msg.token).toBe("sample-fcm-token-12345");
    expect(msg.notification.title).toBe(samplePush.title);
    expect(msg.notification.body).toBe(samplePush.body);
    expect(msg.data.url).toBe("/budgets");
    expect(msg.data.type).toBe("budget_warning");
    expect(msg.apns.payload.aps.sound).toBe("default");
    expect(msg.webpush.notification.dir).toBe("rtl");
    expect(msg.webpush.notification.lang).toBe("ar");
  });

  it("formats English fcmMessage with ltr direction", () => {
    const enPush = {
      title: "Budget Alert",
      body: "You reached 80% of your food budget",
      actionUrl: "/budgets",
      type: "budget_warning",
      lang: "en",
    };
    const msg = fcmMessage("sample-token", enPush);
    expect(msg.webpush.notification.dir).toBe("ltr");
    expect(msg.webpush.notification.lang).toBe("en");
  });

  it("generates valid JSON string for legacy web push payload", () => {
    const raw = legacyPayload(samplePush);
    const parsed = JSON.parse(raw);

    expect(parsed.title).toBe(samplePush.title);
    expect(parsed.body).toBe(samplePush.body);
    expect(parsed.url).toBe("/budgets");
    expect(parsed.type).toBe("budget_warning");
    expect(parsed.dir).toBe("rtl");
    expect(parsed.lang).toBe("ar");
  });
});
