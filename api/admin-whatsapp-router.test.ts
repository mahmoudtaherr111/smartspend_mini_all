import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ value: {} as Record<string, string> }));

vi.mock("./queries/connection", () => ({ db: {} }));
vi.mock("./services/whatsapp-service", () => ({ whatsappService: {} }));
vi.mock("./lib/settings-cache", () => ({
  getSystemSettings: vi.fn(async () => settings.value),
  invalidateSettingsCache: vi.fn(),
}));

import { adminWhatsappRouter } from "./admin-whatsapp-router";

const admin = () =>
  adminWhatsappRouter.createCaller({
    user: { id: 1, type: "oauth", name: "Admin", role: "admin", plan: "free" },
    req: new Request("http://local.test/trpc"),
    ip: "127.0.0.1",
  } as never);

describe("WhatsApp verification in the admin console", () => {
  beforeEach(() => {
    settings.value = {};
  });

  it("shows the value sign-up reads, on and off", async () => {
    settings.value = { whatsapp_otp_enabled: "true" };
    await expect(admin().getSettings()).resolves.toEqual({ otpEnabled: true });
    settings.value = { whatsapp_otp_enabled: "false" };
    await expect(admin().getSettings()).resolves.toEqual({ otpEnabled: false });
  });
});
