import type { HonoRequest } from "hono";
import { isIP } from "node:net";
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

function cleanIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let ip = raw.trim();
  if (!ip) return undefined;
  // Normalize IPv6-mapped IPv4 e.g. ::ffff:192.0.2.1 -> 192.0.2.1
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  return isIP(ip) ? ip : undefined;
}

function isLoopback(ip: string | undefined): boolean {
  return Boolean(ip && (ip === "::1" || ip.startsWith("127.")));
}

function isTrustedProxyPeer(remoteAddress: string | undefined): boolean {
  const peer = cleanIp(remoteAddress);
  if (!peer) return false;
  if (isLoopback(peer)) return true;

  return (env.TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((value) => cleanIp(value))
    .some((value) => value === peer);
}

type ConnectionBackedRequest = {
  raw?: ConnectionBackedRequest;
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
  info?: { remoteAddress?: string };
};

/**
 * Secure client IP extraction.
 * - Trusts exactly one configured forwarding header, never a client-selected precedence chain.
 * - Accepts that header only from loopback or an explicitly configured proxy peer.
 * - Normalizes IPv6-mapped addresses and extracts connection remote address safely.
 */
export function getClientIp(
  req: HonoRequest | Request,
  remoteAddress?: string,
): string {
  const wrappedRequest = req as unknown as ConnectionBackedRequest;
  const rawReq = wrappedRequest.raw || wrappedRequest;
  const socketIp =
    cleanIp(remoteAddress) ||
    cleanIp(
      rawReq.socket?.remoteAddress ||
        rawReq.connection?.remoteAddress ||
        rawReq.info?.remoteAddress,
    );
  const trustProxy = env.TRUST_PROXY === "true" && isTrustedProxyPeer(socketIp);

  if (trustProxy) {
    const forwarded = getIncomingHeader(req, env.TRUSTED_PROXY_HEADER);
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((p) => cleanIp(p))
        .filter(Boolean) as string[];
      if (parts.length > 0) {
        // Exactly one proxy hop is trusted. The proxy must append or overwrite
        // this header, so the nearest untrusted address is the rightmost entry.
        return parts[parts.length - 1];
      }
    }
  }

  if (socketIp) return socketIp;

  return "127.0.0.1";
}
