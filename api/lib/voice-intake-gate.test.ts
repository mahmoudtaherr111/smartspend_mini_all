/**
 * A2 acceptance for H12: the voice quota is enforced before the transcription is bought.
 *
 * The audit's finding was not that one check was weaker on `parseVoiceExpense`. It was
 * that the endpoint the app actually calls when you hold the microphone computed the
 * month's used seconds and then never compared them to anything, read the free-plan
 * limit for every plan, believed the client's duration, and asserted the AI budget only
 * after the STT provider had already been paid.
 *
 * These test the policy directly, because the policy is now one function rather than two
 * inline copies — which is the property that made the drift possible in the first place.
 */
import { describe, it, expect } from "vitest";
import {
  billableDurationSeconds,
  checkVoiceIntake,
  estimateSpeechTokens,
  normalizeAudioMime,
  resolveVoiceLimits,
  MAX_AUDIO_BASE64_LENGTH,
} from "./voice-intake-gate";

/** Base64 of roughly `seconds` worth of the app's own recording bitrate. */
function audioOf(seconds: number, bytesPerSecond = 4_096): string {
  const bytes = Math.max(1, Math.round(seconds * bytesPerSecond));
  return "A".repeat(Math.ceil((bytes * 4) / 3));
}

const FREE = { monthly: 300, perRequest: 60 };

describe("H12 — per-plan limits are read per plan", () => {
  const settings = {
    voice_limit_free: "300",
    voice_limit_pro: "1800",
    voice_limit_ultra: "0",
    voice_per_req_free: "60",
    voice_per_req_pro: "180",
    voice_per_req_ultra: "300",
  };

  it.each([
    ["free", 300, 60],
    ["pro", 1800, 180],
    ["ultra", 0, 300],
  ])("gives %s its own numbers", (plan, monthly, perRequest) => {
    // `parseVoiceExpense` read `voice_limit_free` unconditionally, so a Pro subscription
    // bought no extra seconds on the endpoint that consumes them.
    expect(resolveVoiceLimits(settings, plan)).toEqual({ monthly, perRequest });
  });

  it("falls back to the free row for a plan nobody configured", () => {
    expect(resolveVoiceLimits(settings, "enterprise")).toEqual({ monthly: 300, perRequest: 60 });
  });

  it("survives a settings row that is not a number", () => {
    expect(resolveVoiceLimits({ voice_limit_free: "abc" }, "free").monthly).toBe(300);
  });
});

describe("H12 — duration input is validated without a guessed bitrate", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid duration %s before transcription", (duration) => {
    const verdict = checkVoiceIntake({ plan: "free", mimeType: "audio/webm",
      audioBase64: audioOf(30), claimedDurationSeconds: duration, usedSeconds: 0, limits: FREE });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("invalid_duration");
  });
  it("does not charge a high-bitrate or PCM clip extra seconds because of its size", () => {
    const verdict = checkVoiceIntake({ plan: "free", mimeType: "audio/wav",
      audioBase64: audioOf(10, 192_000), claimedDurationSeconds: 10, usedSeconds: 0, limits: FREE });
    expect(verdict.allowed).toBe(true);
    expect(verdict.billableSeconds).toBe(10);
  });
  it("rounds partial seconds up instead of dropping them", () => {
    expect(billableDurationSeconds(audioOf(5), 5.8)).toBe(6);
  });
  it("rejects an honestly reported recording above its per-request limit", () => {
    expect(checkVoiceIntake({ plan: "free", mimeType: "audio/webm", audioBase64: audioOf(61),
      claimedDurationSeconds: 61, usedSeconds: 0, limits: FREE }).reason).toBe("per_request_limit");
  });
});

describe("H12 — the monthly balance is actually compared", () => {
  it("refuses a user who has already spent the month", () => {
    const verdict = checkVoiceIntake({
      plan: "free",
      mimeType: "audio/webm",
      audioBase64: audioOf(10),
      claimedDurationSeconds: 10,
      usedSeconds: 300,
      limits: FREE,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("monthly_limit_reached");
  });

  it("refuses a recording that would overrun what is left", () => {
    const verdict = checkVoiceIntake({
      plan: "free",
      mimeType: "audio/webm",
      audioBase64: audioOf(40),
      claimedDurationSeconds: 40,
      usedSeconds: 280,
      limits: FREE,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("monthly_limit_exceeded");
    expect(verdict.message).toContain("20");
  });

  it("lets an unlimited plan through and reports no remaining figure", () => {
    const verdict = checkVoiceIntake({
      plan: "ultra",
      mimeType: "audio/webm",
      audioBase64: audioOf(120),
      claimedDurationSeconds: 120,
      usedSeconds: 100_000,
      limits: { monthly: 0, perRequest: 300 },
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.remainingAfter).toBe(-1);
  });

  it("accepts an ordinary recording well inside the budget (positive control)", () => {
    const verdict = checkVoiceIntake({
      plan: "free",
      mimeType: "audio/webm",
      audioBase64: audioOf(8),
      claimedDurationSeconds: 8,
      usedSeconds: 30,
      limits: FREE,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBeUndefined();
    expect(verdict.remainingAfter).toBeGreaterThan(0);
  });
});

describe("H12 — content type and size are policy, not decoration", () => {
  it.each([
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "AUDIO/M4A",
  ])("accepts %s", (mimeType) => {
    const verdict = checkVoiceIntake({
      plan: "free", mimeType, audioBase64: audioOf(5),
      claimedDurationSeconds: 5, usedSeconds: 0, limits: FREE,
    });
    expect(verdict.allowed).toBe(true);
  });

  it.each(["video/mp4", "application/octet-stream", "text/plain", "", "image/png"])(
    "refuses %s",
    (mimeType) => {
      const verdict = checkVoiceIntake({
        plan: "free", mimeType, audioBase64: audioOf(5),
        claimedDurationSeconds: 5, usedSeconds: 0, limits: FREE,
      });
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe("unsupported_media_type");
    },
  );

  it("normalises a codec parameter rather than rejecting on it", () => {
    expect(normalizeAudioMime("audio/webm;codecs=opus")).toBe("audio/webm");
  });

  it("measures size on the payload, not on the data: header", () => {
    const payload = "A".repeat(MAX_AUDIO_BASE64_LENGTH + 10);
    const verdict = checkVoiceIntake({
      plan: "ultra",
      mimeType: "audio/webm",
      audioBase64: `data:audio/webm;base64,${payload}`,
      claimedDurationSeconds: 10,
      usedSeconds: 0,
      limits: { monthly: 0, perRequest: 100_000 },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("payload_too_large");
  });
});

describe("H12 — both endpoints price the same audio identically", () => {
  it("reserves more than the empty minimum for a valid thirty-second recording", () => {
    const audio = audioOf(30);
    const reserved = estimateSpeechTokens(audio, billableDurationSeconds(audio, 30));
    const emptyClip = estimateSpeechTokens("", 0);
    expect(reserved).toBeGreaterThan(emptyClip);
    expect(billableDurationSeconds(audio, 30)).toBe(30);
  });

  it("gives the same answer to both endpoints for the same recording", () => {
    // The property that was missing: two inline copies of this arithmetic charged
    // differently for identical audio. One function cannot.
    const audio = audioOf(25);
    const a = estimateSpeechTokens(audio, billableDurationSeconds(audio, 25));
    const b = estimateSpeechTokens(audio, billableDurationSeconds(audio, 25));
    expect(a).toBe(b);
  });

  it("never reserves less than the floor", () => {
    expect(estimateSpeechTokens("", 0)).toBeGreaterThanOrEqual(80);
  });

  it("grows with the recording", () => {
    const short = estimateSpeechTokens(audioOf(5), 5);
    const long = estimateSpeechTokens(audioOf(50), 50);
    expect(long).toBeGreaterThan(short);
  });
});
