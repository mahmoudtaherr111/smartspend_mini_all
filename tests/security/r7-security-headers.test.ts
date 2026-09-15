import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { httpsRedirect, securityHeaders } from "../../api/lib/security-headers";

/**
 * Security headers and HTTPS redirection as the live app applies them. api/boot.ts mounts the two
 * middlewares from api/lib/security-headers.ts, so this suite tests the production configuration itself.
 */
function appWith(isProduction: boolean) {
  const app = new Hono();
  app.use("*", httpsRedirect(isProduction));
  app.use("*", securityHeaders(isProduction));
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/api/test", (c) => c.text("Secure Response"));
  return app;
}

describe("R7 Security: Security Headers & Transport Layer Security", () => {
  it("api/boot.ts mounts both middlewares on the live app", () => {
    const boot = fs.readFileSync(path.resolve(__dirname, "../../api/boot.ts"), "utf8");
    expect(boot).toContain("httpsRedirect(isProduction)");
    expect(boot).toContain("securityHeaders(isProduction)");
  });

  describe("Production Environment Security Headers", () => {
    const prodApp = appWith(true);

    it("includes comprehensive Content-Security-Policy header on all responses", async () => {
      const res = await prodApp.request("/health");
      expect(res.status).toBe(200);

      const csp = res.headers.get("content-security-policy");
      expect(csp).not.toBeNull();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("https://challenges.cloudflare.com");
      expect(csp).toContain("https://fonts.googleapis.com");
      expect(csp).toContain("https://fonts.gstatic.com");
    });

    it("enforces Strict-Transport-Security (HSTS) with at least 1-year max-age in production", async () => {
      const res = await prodApp.request("/api/test");
      expect(res.status).toBe(200);

      const hsts = res.headers.get("strict-transport-security");
      expect(hsts).not.toBeNull();
      const maxAge = Number(hsts?.match(/max-age=(\d+)/)?.[1] || 0);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);
      expect(hsts).toContain("includeSubDomains");
    });

    it("enforces X-Content-Type-Options: nosniff against MIME-type confusion attacks", async () => {
      const res = await prodApp.request("/health");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("enforces clickjacking protection via X-Frame-Options: DENY and frame-ancestors 'none'", async () => {
      const res = await prodApp.request("/health");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    });

    it("enforces Referrer-Policy: strict-origin-when-cross-origin", async () => {
      const res = await prodApp.request("/health");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    });

    it("restricts dangerous permissions in Permissions-Policy header", async () => {
      const res = await prodApp.request("/health");
      const permPolicy = res.headers.get("permissions-policy");
      expect(permPolicy).not.toBeNull();
      expect(permPolicy).toContain("camera=()");
      expect(permPolicy).toContain("geolocation=()");
      // Voice input needs the microphone on the app's own origin.
      expect(permPolicy).toContain("microphone=(self)");
    });
  });

  describe("Development / Non-Production Environment Security Headers", () => {
    const devApp = appWith(false);

    it("does not enforce HSTS in development mode to avoid localhost lockout", async () => {
      const res = await devApp.request("/health");
      expect(res.headers.get("strict-transport-security")).toBeNull();
    });

    it("still enforces CSP and MIME protection in development mode", async () => {
      const res = await devApp.request("/health");
      expect(res.headers.get("content-security-policy")).not.toBeNull();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("does not redirect plain HTTP in development", async () => {
      const res = await devApp.request("http://localhost/api/test", {
        headers: { "x-forwarded-proto": "http", host: "localhost" },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Transport Layer Security & HTTPS Enforcement", () => {
    const prodApp = appWith(true);

    it("redirects unencrypted HTTP requests to HTTPS with 301 in production", async () => {
      const res = await prodApp.request("http://smartspend.ai/api/test", {
        headers: { "x-forwarded-proto": "http", host: "smartspend.ai" },
      });
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toMatch(/^https:\/\/smartspend\.ai/);
    });

    it("allows direct HTTPS requests through without redirection in production", async () => {
      const res = await prodApp.request("https://smartspend.ai/api/test", {
        headers: { "x-forwarded-proto": "https", host: "smartspend.ai" },
      });
      expect(res.status).toBe(200);
    });
  });
});
