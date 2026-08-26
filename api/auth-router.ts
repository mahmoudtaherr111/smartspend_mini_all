import { z } from "zod";
import { router, publicProcedure, strictPublicProcedure, authedProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import { generateToken, createSession, getSessionMetadata, invalidateSession } from "./local-auth-utils";
import { randomBytes } from "crypto";

export function buildGoogleAuthorizationUrl(state: string): string | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return null;
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

// Google OAuth helpers
async function getGoogleTokens(code: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) throw new Error("Google token response not ok");
    return await response.json();
  } catch (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Network error during Google OAuth token exchange" });
  }
}

async function getGoogleUserInfo(accessToken: string) {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Google userinfo response not ok");
    return await response.json();
  } catch (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Network error during Google OAuth user info retrieval" });
  }
}

export const authRouter = router({
  // State is created by the dedicated Hono start route, which can set its
  // HttpOnly correlation cookie before redirecting to Google.
  googleUrl: publicProcedure.query(() =>
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
      ? "/api/auth/google/start"
      : null,
  ),

  googleCallback: strictPublicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tokens = await getGoogleTokens(input.code);
      if (!tokens.access_token) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "فشل في المصادقة مع Google" });
      }

      const googleUser = await getGoogleUserInfo(tokens.access_token);
      if (!googleUser.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "مش قادر أجيب بيانات Google" });
      }

      // Check if user exists
      let user = await db.query.users.findFirst({
        where: eq(users.unionId, googleUser.id),
      });

      if (!user) {
        // Create new user
        const referral = "SS" + Math.random().toString(36).substring(2, 8).toUpperCase();

        const [newUser] = await db.insert(users).values({
          unionId: googleUser.id,
          email: googleUser.email,
          name: googleUser.name || googleUser.email.split("@")[0],
          avatar: googleUser.picture,
          referralCode: referral,
        }).$returningId();

        user = await db.query.users.findFirst({
          where: eq(users.id, newUser.id),
        });
      } else {
        // Update last sign in
        await db.update(users)
          .set({ lastSignInAt: new Date() })
          .where(eq(users.id, user.id));
      }

      if (!user) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "حصل خطأ في إنشاء الحساب" });
      }

      // Create a proper DB session (matching local auth flow) so token can be revoked
      const token = await generateToken(user.id, "oauth");
      await createSession(user.id, "oauth", token, getSessionMetadata(ctx.req));

      return {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          plan: user.plan,
        },
      };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.type !== "oauth") return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: { id: true, name: true, email: true, avatar: true, role: true, plan: true, createdAt: true, unionId: true },
    });

    return user;
  }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    // Extract the raw token from the request to invalidate the DB session
    const req = ctx.req;
    let rawToken: string | undefined;

    // Check cookie first (Google OAuth flow)
    let cookieHeader: string | null | undefined;
    if ("header" in req && typeof req.header === "function") {
      cookieHeader = (req as any).header("cookie");
    } else {
      cookieHeader = (req as Request).headers.get("cookie");
    }
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)google_session=([^;]*)/);
      if (match) rawToken = match[1];
    }

    // Check Bearer token (local auth flow)
    if (!rawToken) {
      let authHeader: string | undefined;
      if ("header" in req && typeof req.header === "function") {
        authHeader = (req as any).header("Authorization");
      } else {
        authHeader = (req as Request).headers.get("Authorization") ?? undefined;
      }
      if (authHeader?.startsWith("Bearer ")) {
        rawToken = authHeader.slice(7);
      }
    }

    // Invalidate the session in DB
    if (rawToken) {
      await invalidateSession(rawToken);
    }

    return { success: true };
  }),
});
