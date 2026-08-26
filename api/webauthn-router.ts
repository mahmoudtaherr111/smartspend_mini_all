import { z } from "zod";
import {
  router,
  publicProcedure,
  authedProcedure,
  strictPublicProcedure,
} from "./middleware";
import { TRPCError } from "@trpc/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { getDb } from "./queries/connection";
import {
  userCredentials,
  authChallenges,
  localUsers,
  users,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { generateToken, createSession, getSessionMetadata } from "./local-auth-utils";
import { env } from "./lib/env";
import { getIncomingHeader } from "./lib/get-client-ip";

const rpName = "SmartSpend";

function isDevelopmentOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".loca.lt") || host.endsWith(".serveousercontent.com") || host.endsWith(".lhr.life");
  } catch {
    return false;
  }
}

function getWebAuthnConfig(request?: Parameters<typeof getIncomingHeader>[0]) {
  const configuredOrigins = [env.APP_URL, env.FRONTEND_URL].filter(Boolean) as string[];
  const requestOrigin = request ? getIncomingHeader(request, "origin") : undefined;
  const origin =
    requestOrigin &&
    (configuredOrigins.includes(requestOrigin) || (env.NODE_ENV !== "production" && isDevelopmentOrigin(requestOrigin)))
      ? requestOrigin
      : env.APP_URL;
  const url = new URL(origin);
  return { rpID: url.hostname, origin: `${url.protocol}//${url.host}` };
}

export const webauthnRouter = router({
  checkHasPasskey: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const userType = ctx.user.type;

    const credential = await db.query.userCredentials.findFirst({
      where: and(
        eq(userCredentials.userId, userId),
        eq(userCredentials.userType, userType),
      ),
    });

    return { hasPasskey: !!credential };
  }),

  // 1. Generate Registration Options (Requires Auth to tie passkey to an existing account)
  generateRegistrationOptions: authedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    const { rpID } = getWebAuthnConfig(ctx.req);
    const userId = ctx.user.id;
    const userType = ctx.user.type; // "local" | "oauth"

    let username = "user";
    if (userType === "local") {
      const u = await db.query.localUsers.findFirst({
        where: eq(localUsers.id, userId),
      });
      if (u) username = u.phone;
    } else {
      const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (u && u.email) username = u.email;
    }

    const existingCredentials = await db.query.userCredentials.findMany({
      where: and(
        eq(userCredentials.userId, userId),
        eq(userCredentials.userType, userType),
      ),
    });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new Uint8Array(Buffer.from(`${userType}:${userId}`)),
      userName: username,
      // Don't re-register existing credentials
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.id, // Keep as string or convert back as needed. simplewebauthn v13 handles string IDs.
        transports: c.transports
          ? (c.transports.split(",") as AuthenticatorTransportFuture[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // Save challenge
    await db
      .insert(authChallenges)
      .values({
        id: `reg-${userType}-${userId}`,
        userId,
        userType,
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 60000 * 5), // 5 minutes
      })
      .onDuplicateKeyUpdate({
        set: {
          challenge: options.challenge,
          expiresAt: new Date(Date.now() + 60000 * 5),
        },
      });

    return options;
  }),

  // 2. Verify Registration Response
  verifyRegistration: authedProcedure
    .input(
      z.object({
        response: z.any(), // Should be RegistrationResponseJSON
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { rpID, origin } = getWebAuthnConfig(ctx.req);
      const userId = ctx.user.id;
      const userType = ctx.user.type;

      const challengeRecord = await db.query.authChallenges.findFirst({
        where: eq(authChallenges.id, `reg-${userType}-${userId}`),
      });

      if (!challengeRecord || challengeRecord.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Challenge expired or not found",
        });
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: input.response as RegistrationResponseJSON,
          expectedChallenge: challengeRecord.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
        });
      } catch (error: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }

      const { verified, registrationInfo } = verification;

      if (!verified || !registrationInfo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Registration failed",
        });
      }

      const { credential, credentialDeviceType, credentialBackedUp } =
        registrationInfo;

      // Save credential to DB
      await db.insert(userCredentials).values({
        id: credential.id, // already base64url encoded
        userId,
        userType,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports?.join(",") || "",
      });

      // Clear challenge
      await db
        .delete(authChallenges)
        .where(eq(authChallenges.id, `reg-${userType}-${userId}`));

      return { success: true };
    }),

  // 3. Generate Authentication Options (Public because user is logging in)
  generateAuthenticationOptions: strictPublicProcedure
    .input(
      z.object({
        phoneOrEmail: z.string().optional(), // For autofill, this is optional
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { rpID } = getWebAuthnConfig(ctx.req);
      // For a full implementation, we could look up the user by phoneOrEmail to restrict to their credentials
      // However, passkey autofill usually doesn't require prior identification.

      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "preferred",
      });

      // Save challenge (Using a generic ID if no user is known, or return session id)
      const sessionId = crypto.randomUUID();
      await db.insert(authChallenges).values({
        id: sessionId,
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 60000 * 5),
      });

      return { options, sessionId };
    }),

  // 4. Verify Authentication Response
  verifyAuthentication: strictPublicProcedure
    .input(
      z.object({
        response: z.any(), // AuthenticationResponseJSON
        sessionId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { rpID, origin } = getWebAuthnConfig(ctx.req);
      const response = input.response as AuthenticationResponseJSON;

      const challengeRecord = await db.query.authChallenges.findFirst({
        where: eq(authChallenges.id, input.sessionId),
      });

      if (!challengeRecord || challengeRecord.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Challenge expired or not found",
        });
      }

      // Find credential in DB by response.id
      const credentialRecord = await db.query.userCredentials.findFirst({
        where: eq(userCredentials.id, response.id),
      });

      if (!credentialRecord) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Credential not found",
        });
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challengeRecord.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: credentialRecord.id,
            publicKey: new Uint8Array(
              Buffer.from(credentialRecord.publicKey, "base64"),
            ),
            counter: credentialRecord.counter,
            transports: credentialRecord.transports
              ? (credentialRecord.transports.split(",") as any)
              : undefined,
          },
        });
      } catch (error: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }

      const { verified, authenticationInfo } = verification;

      if (!verified || !authenticationInfo) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Authentication failed",
        });
      }

      // Update counter
      await db
        .update(userCredentials)
        .set({
          counter: authenticationInfo.newCounter,
          lastUsedAt: new Date(),
        })
        .where(eq(userCredentials.id, credentialRecord.id));

      // Clear challenge
      await db
        .delete(authChallenges)
        .where(eq(authChallenges.id, input.sessionId));

      // Issue JWT — use the same token format as local-auth so context.ts can validate it
      const token = await generateToken(
        credentialRecord.userId,
        credentialRecord.userType as "oauth" | "local",
      );

      // Create a session record — context.ts requires this to validate Bearer tokens
      await createSession(
        credentialRecord.userId,
        credentialRecord.userType as "oauth" | "local",
        token,
        getSessionMetadata(ctx.req),
      );

      return { success: true, token };
    }),
});
