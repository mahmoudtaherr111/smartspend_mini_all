import { z } from "zod";
import {
  router,
  publicProcedure,
  strictPublicProcedure,
  authedProcedure,
} from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import {
  generateToken,
  createSession,
  getSessionMetadata,
  invalidateSession,
} from "./local-auth-utils";
import { randomBytes, timingSafeEqual } from "crypto";
import { createLogger } from "./lib/log";
import {
  GoogleIdTokenRejected,
  GoogleKeysUnavailable,
  googleClientIdsFromEnv,
  nativeGoogleSignInConfigured,
  verifyGoogleIdToken,
} from "./lib/google-id-token";
import type { Context } from "./context";

const log = createLogger("auth");

export function buildGoogleAuthorizationUrl(
  state: string,
  redirectUri?: string,
): string | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return null;
  }
  const effectiveRedirectUri = redirectUri || env.GOOGLE_REDIRECT_URI;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: effectiveRedirectUri,
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

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function stateMatches(
  expected: string | undefined,
  received: string | undefined,
): boolean {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

// Google OAuth helpers
async function getGoogleTokens(code: string, redirectUri?: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri || env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) throw new Error("Google token response not ok");
    return await response.json();
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Network error during Google OAuth token exchange",
    });
  }
}

async function getGoogleUserInfo(accessToken: string) {
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) throw new Error("Google userinfo response not ok");
    return await response.json();
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Network error during Google OAuth user info retrieval",
    });
  }
}

type GoogleProfile = {
  /** Google's account id: `sub` of an ID token, `id` of the userinfo answer. */
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

type GoogleUser = NonNullable<Awaited<ReturnType<typeof db.query.users.findFirst>>>;

/** The `users` row of a Google account: found by its Google id, or created with a referral code of its own. */
async function findOrCreateGoogleUser(
  profile: GoogleProfile,
): Promise<{ user: GoogleUser; created: boolean }> {
  const existing = await db.query.users.findFirst({
    where: eq(users.unionId, profile.sub),
  });

  if (existing) {
    await db
      .update(users)
      .set({ lastSignInAt: new Date() })
      .where(eq(users.id, existing.id));
    return { user: existing, created: false };
  }

  // Create new user with cryptographically secure referral code
  const referral = "SS" + randomBytes(4).toString("hex").toUpperCase();
  const [newUser] = await db
    .insert(users)
    .values({
      unionId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
      avatar: profile.picture,
      referralCode: referral,
    })
    .$returningId();

  const user = await db.query.users.findFirst({
    where: eq(users.id, newUser.id),
  });
  if (!user) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "حصل خطأ في إنشاء الحساب",
    });
  }
  return { user, created: true };
}

/** A session row and its token for a Google user, so the token can be revoked like a phone login's. */
async function startGoogleSession(user: GoogleUser, ctx: Context) {
  const token = await generateToken(user.id, "oauth");
  await createSession(
    user.id,
    "oauth",
    token,
    getSessionMetadata(ctx.req, ctx.ip),
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
    .input(
      z.object({
        code: z.string(),
        redirectUri: z.string().optional(),
        state: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // CSRF protection: Validate OAuth state parameter against the oauth_state cookie
      const cookieHeader = ctx.req
        ? typeof (ctx.req as any).header === "function"
          ? (ctx.req as any).header("cookie")
          : (ctx.req as Request).headers?.get?.("cookie")
        : undefined;

      const expectedState = readCookie(
        cookieHeader ?? undefined,
        "oauth_state",
      );

      if (
        !expectedState ||
        !input.state ||
        !stateMatches(expectedState, input.state)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "فشل التحقق من حالة المصادقة (CSRF state validation failed)",
        });
      }

      const tokens = await getGoogleTokens(input.code, input.redirectUri);
      if (!tokens.access_token) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "فشل في المصادقة مع Google",
        });
      }

      const googleUser = await getGoogleUserInfo(tokens.access_token);
      if (!googleUser.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "مش قادر أجيب بيانات Google",
        });
      }

      const { user } = await findOrCreateGoogleUser({
        sub: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
      });
      return startGoogleSession(user, ctx);
    }),

  /**
   * Sign-in for the mobile app: the ID token the phone's Google SDK returned, checked against Google's keys and
   * the app's client ids (`api/lib/google-id-token.ts`), then the same account and session as the redirect flow.
   * The token comes back in the answer, as `localAuth.login` does; no cookie is set.
   */
  signInWithGoogle: strictPublicProcedure
    .input(z.object({ idToken: z.string().min(1).max(8_192) }))
    .mutation(async ({ input, ctx }) => {
      const clients = googleClientIdsFromEnv();
      if (!nativeGoogleSignInConfigured(clients)) {
        log.warn({ event: "auth.google_id_token.unconfigured" }, "No mobile Google client id is configured");
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "الدخول بحساب Google من التطبيق مش متاح دلوقتي. ادخل برقم التليفون.",
        });
      }

      let identity;
      try {
        identity = await verifyGoogleIdToken(input.idToken, clients);
      } catch (error) {
        if (error instanceof GoogleIdTokenRejected) {
          log.warn({ event: "auth.google_id_token.rejected", reason: error.reason }, "Google ID token refused");
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "ماقدرناش نتأكد من حساب Google. جرّب تاني.",
          });
        }
        if (error instanceof GoogleKeysUnavailable) {
          log.error({ event: "auth.google_id_token.keys_unavailable" }, "Google signing keys could not be fetched");
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "مش قادرين نوصل لـ Google دلوقتي. جرّب تاني بعد شوية.",
          });
        }
        throw error;
      }

      const { user, created } = await findOrCreateGoogleUser(identity);
      log.info({ event: "auth.google_id_token.signed_in", userId: user.id, created }, "Signed in with a Google ID token");
      return startGoogleSession(user, ctx);
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user || ctx.user.type !== "oauth") return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        plan: true,
        createdAt: true,
        unionId: true,
      },
    });

    return user;
  }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    // Clear Google OAuth cookie on server side
    if (ctx.resHeaders) {
      ctx.resHeaders.append(
        "Set-Cookie",
        "google_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      );
    }

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
