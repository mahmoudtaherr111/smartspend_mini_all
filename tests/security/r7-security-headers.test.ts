import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

/**
 * Security Suite R7: Security Headers & Transport Layer Security
 * Covers:
 *  1. Content-Security-Policy (CSP) tailored to application assets & Turnstile
 *  2. HTTP Strict Transport Security (HSTS) in production environments
 *  3. Clickjacking and MIME sniffing protections (X-Frame-Options, X-Content-Type-Options)
 *  4. Referrer Policy & Permissions Policy
 *  5. HTTPS transport enforcement / redirection simulation
 */

/**
 * Production Security Headers Configuration Factory for Hono
 * Matches target specification in api/boot.ts
 */
export function configureSecurityApp(isProduction: boolean = true) {
  const app = new Hono();

  // 1. HTTPS Redirection Middleware in Production
  app.use("*", async (c, next) => {
    if (isProduction) {
      const proto = c.req.header("x-forwarded-proto");
      const host = c.req.header("host");
      if (proto === "http" && host) {
        return c.redirect(`https://${host}${c.req.url.replace(/^http:\/\/[^/]+/, "")}`, 301);
      }
    }
    await next();
  });

  // 2. Strict Security Headers Middleware
  app.use(
    "*",
    secureHeaders({
      // Content-Security-Policy
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Vite SPA hydration
          "https://challenges.cloudflare.com", // Cloudflare Turnstile
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.googleusercontent.com", // OAuth avatars
        ],
        connectSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
        ],
        frameSrc: ["https://challenges.cloudflare.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
      // Strict-Transport-Security (Production only to avoid localhost lockout)
      strictTransportSecurity: isProduction
        ? "max-age=31536000; includeSubDomains; preload"
        : false,
      xContentTypeOptions: "nosniff",
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      permissionsPolicy: {
        camera: [],
        geolocation: [],
        microphone: ["self"],
      },
    }),
  );

  // Sample Health / API routes
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/api/test", (c) => c.text("Secure Response"));

  return app;
}

describe("R7 Security: Security Headers & Transport Layer Security", () => {
  describe("Production Environment Security Headers", () => {
    const prodApp = configureSecurityApp(true);

    it("includes comprehensive Content-Security-Policy header on all responses", async () => {
      const res = await prodApp.request("/health");
      expect(res.status).toBe(200);

      const csp = res.headers.get("content-security-policy");
      expect(csp).not.toBeNull();

      // Assert critical CSP directives
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");

      // Assert whitelisted external origins
      expect(csp).toContain("https://challenges.cloudflare.com");
      expect(csp).toContain("https://fonts.googleapis.com");
      expect(csp).toContain("https://fonts.gstatic.com");
    });

    it("enforces Strict-Transport-Security (HSTS) with at least 1-year max-age in production", async () => {
      const res = await prodApp.request("/api/test");
      expect(res.status).toBe(200);

      const hsts = res.headers.get("strict-transport-security");
      expect(hsts).not.toBeNull();

      // Must specify max-age >= 31536000 (1 year)
      expect(hsts).toMatch(/max-age=(\d+)/);
      const match = hsts?.match(/max-age=(\d+)/);
      const maxAge = Number(match?.[1] || 0);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);

      // Must include subdomains
      expect(hsts).toContain("includeSubDomains");
    });

    it("enforces X-Content-Type-Options: nosniff against MIME-type confusion attacks", async () => {
      const res = await prodApp.request("/health");
      const xContentType = res.headers.get("x-content-type-options");
      expect(xContentType).toBe("nosniff");
    });

    it("enforces clickjacking protection via X-Frame-Options: DENY or frame-ancestors 'none'", async () => {
      const res = await prodApp.request("/health");
      const xFrame = res.headers.get("x-frame-options");
      const csp = res.headers.get("content-security-policy");

      const hasFrameDeny = xFrame === "DENY" || csp?.includes("frame-ancestors 'none'");
      expect(hasFrameDeny).toBe(true);
    });

    it("enforces Referrer-Policy: strict-origin-when-cross-origin", async () => {
      const res = await prodApp.request("/health");
      const referrerPolicy = res.headers.get("referrer-policy");
      expect(referrerPolicy).toBe("strict-origin-when-cross-origin");
    });

    it("restricts dangerous permissions in Permissions-Policy header", async () => {
      const res = await prodApp.request("/health");
      const permPolicy = res.headers.get("permissions-policy");
      expect(permPolicy).not.toBeNull();

      // Camera and geolocation should be blocked
      expect(permPolicy).toContain("camera=()");
      expect(permPolicy).toContain("geolocation=()");
      // Microphone restricted to self for voice transactions
      expect(permPolicy).toContain("microphone=(self)");
    });
  });

  describe("Development / Non-Production Environment Security Headers", () => {
    const devApp = configureSecurityApp(false);

    it("does not enforce HSTS in development mode to avoid localhost lockout", async () => {
      const res = await devApp.request("/health");
      const hsts = res.headers.get("strict-transport-security");
      expect(hsts).toBeNull();
    });

    it("still enforces CSP and MIME protection in development mode", async () => {
      const res = await devApp.request("/health");
      expect(res.headers.get("content-security-policy")).not.toBeNull();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });
  });

  describe("Transport Layer Security & HTTPS Enforcement", () => {
    const prodApp = configureSecurityApp(true);

    it("redirects unencrypted HTTP requests to HTTPS with 301 in production", async () => {
      const res = await prodApp.request("http://smartspend.ai/api/test", {
        headers: {
          "x-forwarded-proto": "http",
          host: "smartspend.ai",
        },
      });

      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toMatch(/^https:\/\/smartspend\.ai/);
    });

    it("allows direct HTTPS requests through without redirection in production", async () => {
      const res = await prodApp.request("https://smartspend.ai/api/test", {
        headers: {
          "x-forwarded-proto": "https",
          host: "smartspend.ai",
        },
      });

      expect(res.status).toBe(200);
    });
  });
});
