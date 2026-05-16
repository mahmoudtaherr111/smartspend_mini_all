import type { HonoRequest } from "hono";

/** tRPC passes a Fetch API `Request`; Hono routes pass `HonoRequest` — unify header reads. */
export function getIncomingHeader(req: HonoRequest | Request, name: string): string | undefined {
  if ("header" in req && typeof (req as HonoRequest).header === "function") {
    return (req as HonoRequest).header(name);
  }
  return (req as Request).headers.get(name) ?? undefined;
}

/** Best-effort client IP for rate limiting (honors common reverse-proxy headers). */
export function getClientIp(req: HonoRequest | Request): string {
  const xff = getIncomingHeader(req, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    getIncomingHeader(req, "cf-connecting-ip") ||
    getIncomingHeader(req, "x-real-ip") ||
    "unknown"
  );
}
