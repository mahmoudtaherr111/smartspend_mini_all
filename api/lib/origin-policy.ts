type OriginConfig = {
  APP_URL?: string;
  FRONTEND_URL?: string;
  ALLOWED_ORIGINS?: string;
  NODE_ENV?: string;
  PORT?: string;
};

const nativeOrigins = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
];

function configuredWebOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.hostname.includes("*")
  ) {
    throw new Error(
      "Trusted origins must be exact HTTP(S) origins without paths or wildcards",
    );
  }
  return url.origin;
}

/** Shared by HTTP, WebSocket, WebAuthn and Vite; never trust a Host header
 * or an entire third-party tunnel domain as evidence of an allowed origin. */
export function createOriginPolicy(config: OriginConfig) {
  const origins = [
    config.APP_URL,
    config.FRONTEND_URL,
    ...(config.ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);

  // The production bundle is intentionally self-hostable from this machine as
  // well as through the configured public tunnel. Vite emits module scripts
  // with CORS semantics, so rejecting the exact loopback origin here leaves a
  // blank page even though the HTML itself is served successfully.
  const localPorts =
    config.NODE_ENV === "development"
      ? new Set(["3000", "5173", config.PORT || "3000"])
      : new Set([config.PORT || "3000"]);
  for (const port of localPorts) {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      origins.push(`http://${host}:${port}`);
    }
  }

  const webOrigins = [...new Set(origins.map(configuredWebOrigin))];
  const webSet = new Set(webOrigins);
  const allowed = new Set([...webOrigins, ...nativeOrigins]);

  return {
    webOrigins,
    // Vite checks hostnames, while HTTP origin checks also enforce scheme/port.
    allowedHosts: [
      ...new Set(webOrigins.map((origin) => new URL(origin).hostname)),
    ],
    isAllowedOrigin: (origin: string | undefined): boolean =>
      !!origin && allowed.has(origin),
    isAllowedWebOrigin: (origin: string | undefined): boolean =>
      !!origin && webSet.has(origin),
    // Native/non-browser WebSocket clients can omit Origin; session validation
    // is still required by the voice service before any privileged operation.
    isAllowedWebSocketOrigin: (origin: string | undefined): boolean =>
      origin === undefined || allowed.has(origin),
  };
}

export type OriginPolicy = ReturnType<typeof createOriginPolicy>;
