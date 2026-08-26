import { HonoRequest } from "hono";
import { db } from "./queries/connection";
import { localUsers, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { getClientIp } from "./lib/get-client-ip";
import { validateActiveSessionToken } from "./lib/session-validation";

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

  // 1. Try Google OAuth (cookie) — now validates against sessions DB
  const googleToken = parseCookie(req, "google_session");
  if (googleToken) {
    const activeSession = await validateActiveSessionToken(googleToken, "oauth");
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
      }
    }
  }

  // 2. Try Local/WebAuthn Auth (Bearer token — supports both local and oauth users)
  if (!user) {
    const authHeader = getAuthHeader(req);
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const activeSession = await validateActiveSessionToken(token);
      if (activeSession) {
            if (activeSession.userType === "oauth") {
              // Resolve from Google OAuth users table
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
              // Resolve from local users table
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
      }
    }
  }

  return { user, req, ip: getClientIp(req) };
}
