import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createOriginPolicy } from "./origin-policy";
import { applyOriginSecurity } from "./http-origin-security";

const tunnel = "https://nutty-husband-customary.ngrok-free.dev";
const untrustedOrigins = [
  "https://localhost.audit.invalid",
  "https://127.0.0.1.audit.invalid",
  "https://attacker.ngrok-free.dev",
  "https://attacker.ngrok-free.app",
  "https://attacker.ngrok.app",
  "https://attacker.ngrok.io",
  "https://attacker.trycloudflare.com",
  "https://attacker.loca.lt",
  "https://attacker.serveousercontent.com",
  "https://attacker.lhr.life",
  `${tunnel}.audit.invalid`,
  `${tunnel}:444`,
  tunnel.replace("https:", "http:"),
  `${tunnel}/path`,
  `https://attacker@${new URL(tunnel).host}`,
  "capacitor://attacker",
  "ionic://attacker",
  "null",
  "",
];

describe("exact trusted origin policy", () => {
  for (const NODE_ENV of ["development", "production"]) {
    const policy = createOriginPolicy({ APP_URL: tunnel, NODE_ENV });
    it(`${NODE_ENV}: keeps the configured public domain`, () => {
      expect(policy.isAllowedOrigin(tunnel)).toBe(true);
      expect(policy.isAllowedWebSocketOrigin(tunnel)).toBe(true);
      expect(policy.allowedHosts).toContain(new URL(tunnel).hostname);
    });
    it.each(untrustedOrigins)(`${NODE_ENV}: rejects %s`, (origin) => {
      expect(policy.isAllowedOrigin(origin)).toBe(false);
      expect(policy.isAllowedWebSocketOrigin(origin)).toBe(false);
      expect(policy.isAllowedWebOrigin(origin)).toBe(false);
    });
    it(`${NODE_ENV}: allows only the known native app origins`, () => {
      for (const origin of [
        "capacitor://localhost",
        "ionic://localhost",
        "http://localhost",
        "https://localhost",
      ]) {
        expect(policy.isAllowedOrigin(origin)).toBe(true);
      }
    });
  }
  it("allows exact local hosting ports, not arbitrary ports or local-looking domains", () => {
    const policy = createOriginPolicy({
      NODE_ENV: "development",
      PORT: "3001",
    });
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      for (const port of [3000, 3001, 5173]) {
        expect(policy.isAllowedOrigin(`http://${host}:${port}`)).toBe(true);
      }
    }
    expect(policy.isAllowedOrigin("http://localhost:9090")).toBe(false);
    const productionPolicy = createOriginPolicy({
      NODE_ENV: "production",
      PORT: "3000",
    });
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(productionPolicy.isAllowedOrigin(`http://${host}:3000`)).toBe(
        true,
      );
    }
    expect(productionPolicy.isAllowedOrigin("http://localhost:5173")).toBe(
      false,
    );
  });
  it("supports an explicit separate frontend and additional exact origins", () => {
    const policy = createOriginPolicy({
      APP_URL: `${tunnel}/`,
      FRONTEND_URL: "https://app.example.invalid",
      ALLOWED_ORIGINS:
        " http://192.0.2.1:3000,https://staging.example.invalid/ ",
    });
    expect(policy.webOrigins).toEqual([
      tunnel,
      "https://app.example.invalid",
      "http://192.0.2.1:3000",
      "https://staging.example.invalid",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]);
    expect(policy.allowedHosts).not.toContain(".ngrok-free.dev");
  });
  it.each([
    "*",
    "https://*.ngrok-free.dev",
    "https://example.invalid/path",
    "https://user:password@example.invalid",
    "https://example.invalid?x=1",
    "https://example.invalid#x",
    "file:///tmp",
  ])("rejects unsafe configuration %s", (origin) => {
    expect(() => createOriginPolicy({ ALLOWED_ORIGINS: origin })).toThrow();
  });
  it("permits missing Origin only for non-browser WebSocket clients, not as a trusted browser origin", () => {
    const policy = createOriginPolicy({ APP_URL: tunnel });
    expect(policy.isAllowedWebSocketOrigin(undefined)).toBe(true);
    expect(policy.isAllowedOrigin(undefined)).toBe(false);
  });
});

describe("HTTP origin enforcement before handlers", () => {
  const policy = createOriginPolicy({
    APP_URL: tunnel,
    NODE_ENV: "development",
  });
  function setup() {
    const handler = vi.fn();
    const app = new Hono();
    applyOriginSecurity(app, policy);
    app.all("/api/test", (c) => {
      handler();
      return c.json({ ok: true });
    });
    return { app, handler };
  }
  it.each(["GET", "POST", "OPTIONS"])(
    "rejects untrusted Origin on %s without running the handler",
    async (method) => {
      const { app, handler } = setup();
      const response = await app.request("/api/test", {
        method,
        headers: {
          Origin: "https://localhost.audit.invalid",
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "same-origin",
        },
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    },
  );
  it.each([tunnel, "http://localhost:3000", "capacitor://localhost"])(
    "keeps legitimate JSON API access from %s",
    async (origin) => {
      const { app, handler } = setup();
      const response = await app.request("/api/test", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true",
      );
      expect(handler).toHaveBeenCalledOnce();
    },
  );
  it("allows a configured-origin preflight without invoking the operation", async () => {
    const { app, handler } = setup();
    const response = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: tunnel,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(tunnel);
    expect(handler).not.toHaveBeenCalled();
  });
  it("retains CSRF rejection of form posts without Origin or fetch metadata", async () => {
    const { app, handler } = setup();
    const response = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "x=1",
    });
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
  it("does not block origin-less server-to-server JSON requests or normal navigations", async () => {
    const { app, handler } = setup();
    expect((await app.request("/api/test")).status).toBe(200);
    expect(
      (
        await app.request("/api/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
