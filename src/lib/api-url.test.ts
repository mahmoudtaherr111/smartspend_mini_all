/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  getAbsoluteApiUrl,
  getApiBaseUrl,
  getApiUrl,
  getPublicOrigin,
  getWsUrl,
  isNgrokUrl,
  normalizeApiBaseUrl,
} from "./api-url";

describe("api-url resolver", () => {
  it("normalizes whitespace and trailing slashes", () => {
    expect(normalizeApiBaseUrl("  https://api.smartspend.app///  ")).toBe(
      "https://api.smartspend.app",
    );
    expect(normalizeApiBaseUrl("")).toBe("");
    expect(normalizeApiBaseUrl(null)).toBe("");
    expect(getApiBaseUrl("https://api.smartspend.app/")).toBe(
      "https://api.smartspend.app",
    );
  });

  it("keeps relative paths on same-origin web when VITE_API_URL is empty", () => {
    expect(getApiUrl("/api/trpc", "")).toBe("/api/trpc");
    expect(getApiUrl("api/sse/otp?challenge=abc", "")).toBe(
      "/api/sse/otp?challenge=abc",
    );
    expect(getApiUrl("/downloads/smartspend-sync.apk", "")).toBe(
      "/downloads/smartspend-sync.apk",
    );
  });

  it("resolves against VITE_API_URL on Capacitor iOS (capacitor://localhost)", () => {
    const apiBase = "https://api.smartspend.app/";
    expect(getApiUrl("/api/trpc", apiBase)).toBe(
      "https://api.smartspend.app/api/trpc",
    );
    expect(getApiUrl("/api/sse/otp?challenge=xyz", apiBase)).toBe(
      "https://api.smartspend.app/api/sse/otp?challenge=xyz",
    );
    expect(getApiUrl("/api/sms/android-connect", apiBase)).toBe(
      "https://api.smartspend.app/api/sms/android-connect",
    );
    expect(getApiUrl("/api/auth/google/start", apiBase)).toBe(
      "https://api.smartspend.app/api/auth/google/start",
    );
  });

  it("passes through already-absolute HTTP(S) URLs untouched", () => {
    expect(
      getApiUrl(
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://api.smartspend.app",
      ),
    ).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(
      getAbsoluteApiUrl(
        "https://custom.example.com/hook",
        "https://api.smartspend.app",
      ),
    ).toBe("https://custom.example.com/hook");
  });

  it("never leaks capacitor://localhost into Apple Shortcuts webhook URLs", () => {
    expect(
      getAbsoluteApiUrl(
        "/api/sms/ingest?token=secret123",
        "https://api.smartspend.app/",
        "capacitor://localhost",
      ),
    ).toBe("https://api.smartspend.app/api/sms/ingest?token=secret123");

    expect(
      getPublicOrigin("https://api.smartspend.app/v1", "capacitor://localhost"),
    ).toBe("https://api.smartspend.app");

    // On web without VITE_API_URL, uses window origin
    expect(
      getAbsoluteApiUrl(
        "/api/sms/ingest?token=secret123",
        "",
        "https://smartspend.app",
      ),
    ).toBe("https://smartspend.app/api/sms/ingest?token=secret123");
  });

  it("resolves WebSocket URLs cleanly for Capacitor iOS and Web", () => {
    expect(
      getWsUrl(
        "/api/voice/v2",
        "https://api.smartspend.app/",
        "capacitor://localhost/dashboard",
      ),
    ).toBe("wss://api.smartspend.app/api/voice/v2");

    expect(
      getWsUrl(
        "/api/voice/v2",
        "http://192.168.1.5:3000/",
        "capacitor://localhost/dashboard",
      ),
    ).toBe("ws://192.168.1.5:3000/api/voice/v2");

    // Web fallback without VITE_API_URL ignores current route path
    expect(
      getWsUrl("/api/voice/v2", "", "https://smartspend.app/dashboard?tab=ai"),
    ).toBe("wss://smartspend.app/api/voice/v2");

    // Already absolute WS URL passes through
    expect(getWsUrl("wss://voice.smartspend.app/api/voice/v2", "")).toBe(
      "wss://voice.smartspend.app/api/voice/v2",
    );
  });

  it("identifies ngrok tunnel domains safely without false positives", () => {
    expect(isNgrokUrl("https://nutty-husband-customary.ngrok-free.dev")).toBe(
      true,
    );
    expect(isNgrokUrl("https://foo.ngrok-free.app/api/trpc")).toBe(true);
    expect(isNgrokUrl("https://foo.ngrok.app/api/trpc")).toBe(true);
    expect(isNgrokUrl("https://foo.ngrok.io")).toBe(true);

    expect(isNgrokUrl("https://api.smartspend.app")).toBe(false);
    expect(isNgrokUrl("https://ngrok-free.dev.evil.com")).toBe(false);
    expect(isNgrokUrl("/api/trpc")).toBe(false);
    expect(isNgrokUrl("")).toBe(false);
    expect(isNgrokUrl(null)).toBe(false);
  });
});
