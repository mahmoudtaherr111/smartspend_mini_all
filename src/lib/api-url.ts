/**
 * Central API & WebSocket URL resolver for Web, PWA, and Capacitor (iOS / Android).
 *
 * - On Web / PWA (same-origin deployment without `VITE_API_URL`): returns relative paths
 *   (`/api/...`) so Vite dev proxies and same-origin deployments work identically.
 * - On Capacitor (`capacitor://localhost` / `ionic://localhost`) or split deployments where
 *   `VITE_API_URL` is configured (e.g. `https://api.smartspend.app`): resolves to absolute
 *   HTTPS / WSS URLs cleanly without duplicate slashes.
 */

const ABSOLUTE_HTTP_RE = /^https?:\/\//i;
const ABSOLUTE_WS_RE = /^wss?:\/\//i;

export function normalizeApiBaseUrl(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/\/+$/, "");
}

export function getApiBaseUrl(override?: string | null): string {
  if (override !== undefined) {
    return normalizeApiBaseUrl(override);
  }
  const viteMeta = (import.meta as { env?: Record<string, string | undefined> })
    ?.env;
  return normalizeApiBaseUrl(viteMeta?.VITE_API_URL);
}

function normalizeLeadingSlash(path: string): string {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Resolves an API path (`/api/...` or `/downloads/...`).
 * Returns a relative path on same-origin web (when `VITE_API_URL` is unset),
 * or an absolute URL against `VITE_API_URL` when configured (e.g. Capacitor iOS/Android).
 */
export function getApiUrl(
  path: string,
  apiBaseOverride?: string | null,
): string {
  if (ABSOLUTE_HTTP_RE.test(path)) {
    return path;
  }
  const normalizedPath = normalizeLeadingSlash(path);
  const base = getApiBaseUrl(apiBaseOverride);
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Resolves a public-facing origin for external integrations (e.g. Apple Shortcuts webhooks).
 * Prefers `VITE_API_URL` when set so Capacitor (`capacitor://localhost`) never leaks into
 * copied URLs, falling back to `window.location.origin` on web.
 */
export function getPublicOrigin(
  apiBaseOverride?: string | null,
  fallbackOrigin?: string,
): string {
  const base = getApiBaseUrl(apiBaseOverride);
  if (base) {
    try {
      return new URL(base).origin;
    } catch {
      return base;
    }
  }
  if (fallbackOrigin !== undefined) {
    return normalizeApiBaseUrl(fallbackOrigin);
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeApiBaseUrl(window.location.origin);
  }
  return "";
}

/**
 * Resolves an always-absolute HTTP(S) URL for external tools (Apple Shortcuts, deep links).
 * Uses `VITE_API_URL` when set, otherwise falls back to `window.location.origin`.
 */
export function getAbsoluteApiUrl(
  path: string,
  apiBaseOverride?: string | null,
  fallbackOrigin?: string,
): string {
  if (ABSOLUTE_HTTP_RE.test(path)) {
    return path;
  }
  const normalizedPath = normalizeLeadingSlash(path);
  const base = getApiBaseUrl(apiBaseOverride);
  if (base) {
    return `${base}${normalizedPath}`;
  }
  const origin = getPublicOrigin("", fallbackOrigin);
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
}

/**
 * Resolves a WebSocket URL (`ws://` or `wss://`) for paths like `/api/voice/v2`.
 * Prefers `VITE_API_URL` when set; otherwise derives protocol and host from `window.location.href`.
 */
export function getWsUrl(
  path: string,
  apiBaseOverride?: string | null,
  fallbackHref?: string,
): string {
  if (ABSOLUTE_WS_RE.test(path)) {
    return path;
  }
  const normalizedPath = normalizeLeadingSlash(path);
  const base = getApiBaseUrl(apiBaseOverride);
  const defaultHref =
    fallbackHref ??
    (typeof window !== "undefined" && window.location?.href
      ? window.location.href
      : "http://localhost:3000");

  if (base) {
    try {
      const parsed = new URL(base);
      const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      const basePath = parsed.pathname.replace(/\/+$/, "");
      return `${protocol}//${parsed.host}${basePath}${normalizedPath}`;
    } catch {
      // Fall through to fallbackHref if VITE_API_URL is malformed
    }
  }

  const parsedFallback = new URL(defaultHref);
  const protocol = parsedFallback.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${parsedFallback.host}${normalizedPath}`;
}
