import type { HonoRequest } from "hono";
import { env } from "./env";

/** tRPC passes a Fetch API `Request`; Hono routes pass `HonoRequest` — unify header reads. */
export function getIncomingHeader(
  req: HonoRequest | Request,
  name: string,
): string | undefined {
  if ("header" in req && typeof (req as HonoRequest).header === "function") {
    return (req as HonoRequest).header(name);
  }
  return (req as Request).headers.get(name) ?? undefined;
}

/** Secure client IP extraction. Does not trust arbitrary forwarded headers unless TRUST_PROXY is set to "true". */
export function getClientIp(req: HonoRequest | Request): string {
  // If we don't trust proxies, do not look at X-Forwarded-For or X-Real-IP because they are client-spoofable
  const trustProxy = env.TRUST_PROXY === "true";

  if (trustProxy) {
    const xff = getIncomingHeader(req, "x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = getIncomingHeader(req, "x-real-ip");
    if (realIp) return realIp.trim();

    const cfConnecting = getIncomingHeader(req, "cf-connecting-ip");
    if (cfConnecting) return cfConnecting.trim();
  }

  // Fallback: try to get IP from the raw request connection socket if available
  const rawReq = (req as any).raw || req;
  const ip =
    rawReq.socket?.remoteAddress ||
    rawReq.connection?.remoteAddress ||
    "127.0.0.1";
  return ip;
}
