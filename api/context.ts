import { HonoRequest } from "hono";
import { verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
import { db } from "./queries/connection";
import { localUsers, users, sessions } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { env } from "./lib/env";

export type UnifiedUser = {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  role: "user" | "moderator" | "admin";
  plan: "free" | "pro";
  type: "oauth" | "local";
  phone?: string | null;
};

export type Context = {
  user: UnifiedUser | null;
  req: HonoRequest;
};

export async function createContext(req: HonoRequest): Promise<Context> {
  let user: UnifiedUser | null = null;

  // 1. Try Google OAuth (cookie)
  const googleToken = getCookie(req, "google_session");
  if (googleToken) {
    try {
      const payload = await verify(googleToken, env.JWT_SECRET);
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
            plan: dbUser.plan as "free" | "pro",
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
    const authHeader = req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const payload = await verify(token, env.JWT_SECRET);
        if (payload && payload.userId) {
          // Verify session exists and not expired
          const session = await db.query.sessions.findFirst({
            where: and(
              eq(sessions.token, token),
              eq(sessions.userId, Number(payload.userId)),
              eq(sessions.userType, "local"),
              gt(sessions.expiresAt, new Date())
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
                plan: dbUser.plan as "free" | "pro",
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

  return { user, req };
}
