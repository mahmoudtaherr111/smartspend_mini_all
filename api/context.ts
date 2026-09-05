import { HonoRequest } from "hono";
import { db } from "./queries/connection";
import { localUsers, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { getClientIp } from "./lib/get-client-ip";
import {
  validateActiveSessionToken,
  getCachedResolvedSession,
  cacheResolvedSession,
  getAuthVersion,
  hashSessionToken,
} from "./lib/session-validation";

export type UnifiedUser = {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  role: "user" | "moderator" | "admin";
  plan: "free" | "pro" | "ultra";
  type: "oauth" | "local";
  phone?: string | null;
};

export type Context = {
  user: UnifiedUser | null;
  /** May be Hono's request or a Fetch `Request` from @hono/trpc-server */
  req: HonoRequest | Request;
  /** Client IP (from proxy headers when present) — used for public endpoint rate limits */
  ip: string;
  resHeaders?: Headers;
};

// Parse cookies from request header manually (works with both HonoRequest and raw Request)
function parseCookie(
  req: HonoRequest | Request,
  name: string,
): string | undefined {
  let cookieHeader: string | null | undefined;
  if ("header" in req && typeof req.header === "function") {
    cookieHeader = (req as HonoRequest).header("cookie");
  } else {
    cookieHeader = (req as Request).headers.get("cookie");
  }
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : undefined;
}

// Get authorization header from either request type
function getAuthHeader(req: HonoRequest | Request): string | undefined {
  if ("header" in req && typeof req.header === "function") {
    return (req as HonoRequest).header("Authorization");
  }
  return (req as Request).headers.get("Authorization") ?? undefined;
}

export async function createContext(
  reqOrOpts:
    | HonoRequest
    | Request
    | {
        req: Request | HonoRequest;
        resHeaders?: Headers;
        directIp?: string;
        [key: string]: unknown;
      },
  resHeadersParam?: Headers,
): Promise<Context> {
  let req: HonoRequest | Request;
  let resHeaders: Headers | undefined = resHeadersParam;
  let directIp: string | undefined;

  if (
    reqOrOpts &&
    typeof reqOrOpts === "object" &&
    "req" in reqOrOpts &&
    reqOrOpts.req
  ) {
    req = reqOrOpts.req as HonoRequest | Request;
    directIp =
      "directIp" in reqOrOpts && typeof reqOrOpts.directIp === "string"
        ? reqOrOpts.directIp
        : undefined;
    if (
      !resHeaders &&
      "resHeaders" in reqOrOpts &&
      reqOrOpts.resHeaders instanceof Headers
    ) {
      resHeaders = reqOrOpts.resHeaders;
    }
  } else {
    req = reqOrOpts as HonoRequest | Request;
  }

  let user: UnifiedUser | null = null;

  // 1. Try Local/WebAuthn/Bearer Auth FIRST (Authorization header takes precedence over cookie)
  const authHeader = getAuthHeader(req);
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const { hex: tokenHashHex } = hashSessionToken(token);

      // Fast Path (P1): 0 MySQL queries when principal is warm in Redis
      const cached = await getCachedResolvedSession(tokenHashHex);
      if (cached) {
        user = cached.user;
      } else {
        // Fallback: Verify active database session
        const activeSession = await validateActiveSessionToken(token);
        if (activeSession) {
          if (activeSession.userType === "oauth") {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, activeSession.userId),
            });
            if (dbUser) {
              user = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                avatar: dbUser.avatar,
                role: dbUser.role as "user" | "moderator" | "admin",
                plan: dbUser.plan as "free" | "pro" | "ultra",
                type: "oauth",
              };
            }
          } else {
            const dbUser = await db.query.localUsers.findFirst({
              where: eq(localUsers.id, activeSession.userId),
            });
            if (dbUser) {
              user = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                avatar: dbUser.avatar,
                role: dbUser.role as "user" | "moderator" | "admin",
                plan: dbUser.plan as "free" | "pro" | "ultra",
                type: "local",
                phone: dbUser.phone,
              };
            }
          }

          if (user) {
            const authver = await getAuthVersion(user.type, user.id);
            await cacheResolvedSession(
              tokenHashHex,
              user,
              activeSession.expiresAt,
              authver,
            );
          }
        }
      }
    }
  }

  // 2. Try Google OAuth (cookie) as secondary fallback if no user resolved from Bearer token
  if (!user) {
    const googleToken = parseCookie(req, "google_session");
    if (googleToken) {
      const { hex: tokenHashHex } = hashSessionToken(googleToken);

      // Fast Path (P1): 0 MySQL queries when principal is warm in Redis
      const cached = await getCachedResolvedSession(tokenHashHex);
      if (cached) {
        user = cached.user;
      } else {
        const activeSession = await validateActiveSessionToken(
          googleToken,
          "oauth",
        );
        if (activeSession) {
          const dbUser = await db.query.users.findFirst({
            where: eq(users.id, activeSession.userId),
          });
          if (dbUser) {
            user = {
              id: dbUser.id,
              name: dbUser.name,
              email: dbUser.email,
              avatar: dbUser.avatar,
              role: dbUser.role as "user" | "moderator" | "admin",
              plan: dbUser.plan as "free" | "pro" | "ultra",
              type: "oauth",
            };

            const authver = await getAuthVersion("oauth", user.id);
            await cacheResolvedSession(
              tokenHashHex,
              user,
              activeSession.expiresAt,
              authver,
            );
          }
        }
      }
    }
  }

  return { user, req, ip: getClientIp(req, directIp), resHeaders };
}
