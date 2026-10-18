/**
 * HTTPS redirection and security headers for every HTTP response. api/boot.ts mounts both, and
 * tests/security/r7-security-headers.test.ts exercises this exact configuration.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

/**
 * CSP sources for the inline scripts of a page: `'sha256-…'` of each `<script>` without `src`, hashed over its exact
 * text as the browser does. The built index.html has two (theme before paint, the splash-screen timeout).
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push(`'sha256-${createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
  }
  return hashes;
}

/** The hashes of the built web app's inline scripts, or none when this server does not serve it. */
export function builtIndexScriptHashes(indexPath = path.resolve("./dist/public/index.html")): string[] {
  try {
    return inlineScriptHashes(fs.readFileSync(indexPath, "utf8"));
  } catch {
    return [];
  }
}

/** Behind a proxy that reports `x-forwarded-proto: http`, redirects to the same URL over HTTPS (production only). */
export function httpsRedirect(isProduction: boolean): MiddlewareHandler {
  return async (c, next) => {
    if (isProduction) {
      const proto = c.req.header("x-forwarded-proto");
      const host = c.req.header("host");
      if (proto === "http" && host) {
        return c.redirect(`https://${host}${c.req.url.replace(/^http:\/\/[^/]+/, "")}`, 301);
      }
    }
    await next();
  };
}

/**
 * Content-Security-Policy for the app's own assets plus Cloudflare Turnstile, Google Fonts and Google
 * avatars; HSTS only in production, so localhost is never pinned to HTTPS; no framing, no MIME sniffing,
 * a strict referrer policy, and a permissions policy that allows only the microphone (voice input).
 *
 * In production scripts run only from the app's origin, Turnstile, and the inline scripts whose hashes are given:
 * `'unsafe-inline'` would let an injected script run and read the session token the app keeps in localStorage.
 * Development keeps it, for the scripts Vite writes into the page.
 */
export function securityHeaders(isProduction: boolean, scriptHashes: string[] = []): MiddlewareHandler {
  const inlineScripts = isProduction ? scriptHashes : ["'unsafe-inline'"];
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...inlineScripts, "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      frameSrc: ["https://challenges.cloudflare.com"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
    strictTransportSecurity: isProduction ? "max-age=31536000; includeSubDomains; preload" : false,
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    permissionsPolicy: {
      camera: [],
      geolocation: [],
      microphone: ["self"],
    },
  });
}
