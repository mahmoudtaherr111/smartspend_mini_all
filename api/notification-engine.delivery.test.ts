import { describe, expect, it, vi } from "vitest";

vi.mock("./queries/connection", () => ({ db: {} }));
vi.mock("./services/firebase", () => ({ messaging: null, isFirebaseInitialized: false }));

const { sendPush, fcmMessage, legacyPayload } = await import("./notification-engine");

describe("notification delivery engine (DEBT-12)", () => {
  it("formats legacy and FCM push payloads correctly with Egyptian Arabic direction", () => {
    const item = {
      title: "تنبيه النشاط",
      body: "لم تقم بتسجيل أي مصاريف اليوم.",
      actionUrl: "/record",
      type: "inactivity_reminder",
      lang: "ar",
    };

    const fcm = fcmMessage("fcm_token_123", item);
    expect(fcm.token).toBe("fcm_token_123");
    expect(fcm.notification.title).toBe(item.title);
    expect(fcm.webpush.notification.dir).toBe("rtl");
    expect(fcm.webpush.notification.lang).toBe("ar");

    const legacy = JSON.parse(legacyPayload(item));
    expect(legacy.title).toBe(item.title);
    expect(legacy.dir).toBe("rtl");
    expect(legacy.url).toBe("/record");
  });

  it("handles push gracefully when push credentials or firebase are uninitialized", async () => {
    const sub = {
      id: 1,
      userId: 10,
      userType: "local",
      fcmToken: "mock_fcm_token",
      endpoint: "https://fcm.googleapis.com/fcm/send/mock",
      p256dh: "key_p256dh",
      auth: "key_auth",
      deviceType: "android",
    };

    const item = {
      title: "اختبار",
      body: "محتوى التجربة",
      actionUrl: "/dashboard",
      type: "test",
      lang: "ar",
    };

    // Since Firebase messaging is mocked to null in test env, sendPush should return false without throwing unhandled exceptions
    const result = await sendPush(sub, item);
    expect(result).toBe(false);
  });
});
