/**
 * Security suite R3: the "not a robot" check in front of the phone-verification code request.
 *
 * It tests `api/services/turnstile-service.ts` itself. The file this replaces tested its own copy of these
 * functions, so it kept passing while the service honoured Cloudflare's always-passes value in production.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_TEST_TOKENS,
  guardOtpGeneration,
  verifyTurnstileToken,
} from "../../api/services/turnstile-service";

const production = { secret: "0x4AAAAAArealsecret", production: true };
const development = { production: false };

function cloudflareAnswers(body: unknown, ok = true) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("in production", () => {
  it("refuses Cloudflare's always-passes value instead of taking it at its word", async () => {
    cloudflareAnswers({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(guardOtpGeneration(TURNSTILE_TEST_TOKENS.ALWAYS_PASSES, "197.38.1.1", production)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses a request without a token", async () => {
    await expect(guardOtpGeneration(undefined, "197.38.1.1", production)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(guardOtpGeneration("   ", "197.38.1.1", production)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to start verification without TURNSTILE_SECRET_KEY, rather than check against a made-up secret", async () => {
    const fetchSpy = cloudflareAnswers({ success: true });
    await expect(guardOtpGeneration("real-token", "197.38.1.1", { production: true })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare accepts, and sends it the secret and the client's address", async () => {
    const fetchSpy = cloudflareAnswers({ success: true, hostname: "smartspend.ai" });

    await expect(guardOtpGeneration("live-token", "196.221.15.22", production)).resolves.toEqual({ verified: true });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = options.body as URLSearchParams;
    expect(body.get("secret")).toBe(production.secret);
    expect(body.get("response")).toBe("live-token");
    expect(body.get("remoteip")).toBe("196.221.15.22");
  });

  it("refuses a token Cloudflare refuses, and fails closed when Cloudflare cannot be reached", async () => {
    cloudflareAnswers({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(guardOtpGeneration("bot-token", "197.38.1.1", production)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    cloudflareAnswers({}, false);
    await expect(guardOtpGeneration("some-token", "197.38.1.1", production)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await verifyTurnstileToken("some-token", "197.38.1.1", production)).toEqual({
      success: false,
      errorCodes: ["internal-verification-failure"],
    });
  });
});

describe("outside production", () => {
  it("lets the flow run locally without a widget or a secret", async () => {
    await expect(guardOtpGeneration(undefined, "127.0.0.1", development)).resolves.toEqual({ verified: true });
    await expect(guardOtpGeneration("dev-bypass-key", "127.0.0.1", development)).resolves.toEqual({ verified: true });
    await expect(guardOtpGeneration(TURNSTILE_TEST_TOKENS.ALWAYS_PASSES, "127.0.0.1", development)).resolves.toEqual({
      verified: true,
    });
  });

  it("still honours the always-fails and already-spent values", async () => {
    await expect(guardOtpGeneration(TURNSTILE_TEST_TOKENS.ALWAYS_FAILS, "127.0.0.1", development)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(guardOtpGeneration(TURNSTILE_TEST_TOKENS.ALREADY_SPENT, "127.0.0.1", development)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
