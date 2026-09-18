/**
 * Cloudflare Turnstile: the "not a robot" check in front of the phone-verification code request.
 *
 * In production every token goes to Cloudflare's siteverify with `TURNSTILE_SECRET_KEY`, and without that secret
 * the request is refused rather than checked against a made-up one. Outside production a missing token, the
 * `dev-bypass-key` and Cloudflare's always-passes dummy value pass, so the flow can be exercised locally. Those
 * shortcuts used to hold in production too, which let anyone past the check with a string from the docs.
 */
import { TRPCError } from "@trpc/server";
import { env } from "../lib/env";
import { createLogger } from "../lib/log";

const log = createLogger("turnstile");

/** Cloudflare's documented dummy values. Honoured only outside production. */
export const TURNSTILE_TEST_TOKENS = {
  ALWAYS_PASSES: "1x0000000000000000000000000000000AA",
  ALWAYS_FAILS: "2x0000000000000000000000000000000AA",
  ALREADY_SPENT: "3x0000000000000000000000000000000AA",
};

export type TurnstileVerifyResult = {
  success: boolean;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
};

export interface TurnstileConfig {
  secret?: string;
  production: boolean;
}

const configFromEnv = (): TurnstileConfig => ({
  secret: env.TURNSTILE_SECRET_KEY || undefined,
  production: env.NODE_ENV === "production",
});

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp: string | undefined,
  config: TurnstileConfig = configFromEnv(),
): Promise<TurnstileVerifyResult> {
  if (!config.production) {
    if (!token || token === "dev-bypass-key" || token === TURNSTILE_TEST_TOKENS.ALWAYS_PASSES) {
      return { success: true, hostname: "localhost" };
    }
    if (token === TURNSTILE_TEST_TOKENS.ALWAYS_FAILS) return { success: false, errorCodes: ["invalid-input-response"] };
    if (token === TURNSTILE_TEST_TOKENS.ALREADY_SPENT) return { success: false, errorCodes: ["timeout-or-duplicate"] };
    if (!config.secret) return { success: true, hostname: "localhost" };
  }

  if (!config.secret) return { success: false, errorCodes: ["missing-input-secret"] };
  if (!token || token.trim().length === 0) return { success: false, errorCodes: ["missing-input-response"] };

  try {
    const form = new URLSearchParams();
    form.append("secret", config.secret);
    form.append("response", token);
    if (remoteIp) form.append("remoteip", remoteIp);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { success: false, errorCodes: ["turnstile-api-http-error"] };

    const data = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
    };
    return {
      success: Boolean(data.success),
      errorCodes: data["error-codes"],
      challengeTs: data.challenge_ts,
      hostname: data.hostname,
    };
  } catch {
    return { success: false, errorCodes: ["internal-verification-failure"] };
  }
}

/** Refuses the code request unless the Turnstile token checks out. */
export async function guardOtpGeneration(
  token: string | null | undefined,
  remoteIp: string | undefined,
  config: TurnstileConfig = configFromEnv(),
): Promise<{ verified: true }> {
  const result = await verifyTurnstileToken(token, remoteIp, config);
  if (result.success) return { verified: true };

  if (result.errorCodes?.includes("missing-input-secret")) {
    log.error({ event: "turnstile.unconfigured" }, "TURNSTILE_SECRET_KEY is not set; phone verification is refused in production");
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "توثيق الرقم مش متاح دلوقتي. جرّب بعد شوية." });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "التحقق إنك مش روبوت ماعدّاش. جرّب تاني." });
}
