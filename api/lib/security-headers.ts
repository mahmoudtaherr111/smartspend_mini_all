/**
 * HTTPS redirection and security headers for every HTTP response. api/boot.ts mounts both, and
 * tests/security/r7-security-headers.test.ts exercises this exact configuration.
 */
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

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
 */
export function securityHeaders(isProduction: boolean): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
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
