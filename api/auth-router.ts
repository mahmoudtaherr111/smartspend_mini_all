import { z } from "zod";
import { router, publicProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";
import { env } from "./lib/env";

// Google OAuth helpers
async function getGoogleTokens(code: string) {
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
  return response.json();
}

async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json();
}

export const authRouter = router({
  googleUrl: publicProcedure.query(() => {
    // If Google OAuth is not configured, return null so the frontend can hide the button
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
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }),

  googleCallback: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
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

      const token = await sign(
        { userId: user.id, type: "oauth", exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
        env.JWT_SECRET
      );

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
    });

    return user;
  }),

  logout: publicProcedure.mutation(() => {
    return { success: true };
  }),
});
