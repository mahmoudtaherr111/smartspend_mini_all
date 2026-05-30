import { HonoRequest } from "hono";
import { verify } from "hono/jwt";
import { db } from "./queries/connection";
import { localUsers, users, sessions } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { env } from "./lib/env";
import { getClientIp } from "./lib/get-client-ip";

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
  req: HonoRequest | Request,
): Promise<Context> {
  let user: UnifiedUser | null = null;

  // 1. Try Google OAuth (cookie)
  const googleToken = parseCookie(req, "google_session");
  if (googleToken) {
    try {
      const payload = await verify(googleToken, env.JWT_SECRET, "HS256");
      if (payload && payload.userId) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, Number(payload.userId)),
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
      }
    } catch {
      // Invalid token, continue to local auth
    }
  }

  // 2. Try Local Auth (Bearer token)
  if (!user) {
    const authHeader = getAuthHeader(req);
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const payload = await verify(token, env.JWT_SECRET, "HS256");
        if (payload && payload.userId) {
          // Verify session exists and not expired
          const session = await db.query.sessions.findFirst({
            where: and(
              eq(sessions.token, token),
              eq(sessions.userId, Number(payload.userId)),
              eq(sessions.userType, "local"),
              gt(sessions.expiresAt, new Date()),
            ),
          });

          if (session) {
            const dbUser = await db.query.localUsers.findFirst({
              where: eq(localUsers.id, Number(payload.userId)),
            });
            if (dbUser) {
              user = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                role: dbUser.role as "user" | "moderator" | "admin",
                plan: dbUser.plan as "free" | "pro" | "ultra",
                type: "local",
                phone: dbUser.phone,
              };
            }
          }
        }
      } catch {
        // Invalid token
      }
    }
  }

  return { user, req, ip: getClientIp(req) };
}
