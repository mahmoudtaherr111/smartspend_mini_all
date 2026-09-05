/**
 * One policy for accepting audio, applied before anything is paid for.
 *
 * There were two implementations of this and they disagreed on everything that mattered.
 * `speechToText` read per-plan limits, compared the month's used seconds against them,
 * and asserted the AI budget before transcribing. `parseVoiceExpense` — the endpoint the
 * app actually calls when you hold the microphone — computed the used seconds and then
 * never compared them to anything, read `voice_limit_free` for every plan including the
 * ones that paid for more, and asserted the budget AFTER the transcription had already
 * been bought.
 *
 * The result was not a smaller check on one path. It was no check: a user who had spent
 * their monthly seconds kept transcribing, and a client sending `durationSeconds: 0`
 * kept transcribing for free forever, because the number the quota is measured in
 * arrived from the caller and was believed.
 *
 * Zero or invalid duration claims are rejected. Positive claims are still client data;
 * independently verifying compressed media duration remains separate work. Payload size
 * cannot supply that measurement without knowing the actual codec and container.
 *
 * This module is deliberately pure — it takes the settings and the usage, and returns a
 * verdict. The router does the I/O. That is what makes the policy testable without a
 * database, and what makes "both endpoints agree" checkable rather than hoped for.
 */

/** Container formats the transcription providers actually accept. */
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aac",
]);

/** ~10MB of base64. Kept here so both endpoints cannot drift apart on it. */
export const MAX_AUDIO_BASE64_LENGTH = 13_333_333;

/** Payload size bounds upload cost, not duration: bitrate and container overhead vary. */

export interface VoicePlanLimits {
  /** Seconds per calendar cycle. 0 means unlimited. */
  monthly: number;
  /** Seconds in a single recording. */
  perRequest: number;
}

export interface VoiceIntakeInput {
  plan: string;
  mimeType: string;
  /** Base64 payload, with or without a data: prefix. */
  audioBase64: string;
  /** What the client claims. Treated as a claim, not a measurement. */
  claimedDurationSeconds: number;
  /** Seconds already spent in this cycle. */
  usedSeconds: number;
  limits: VoicePlanLimits;
}

export type VoiceRejection =
  | "invalid_duration"
  | "payload_too_large"
  | "unsupported_media_type"
  | "per_request_limit"
  | "monthly_limit_reached"
  | "monthly_limit_exceeded";

export interface VoiceIntakeVerdict {
  allowed: boolean;
  reason?: VoiceRejection;
  /** Arabic, user-facing. Present only on a rejection. */
  message?: string;
  /**
   * Rounded client-reported duration. This is not independently measured audio time.
   */
  billableSeconds: number;
  /** Seconds left after this request, or -1 when the plan is unlimited. */
  remainingAfter: number;
}

/** Strips a `data:` prefix so length is measured on the payload, not the header. */
export function base64Payload(audioBase64: string): string {
  const comma = audioBase64.indexOf(",");
  return comma >= 0 ? audioBase64.slice(comma + 1) : audioBase64;
}

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function normalizeAudioMime(mimeType: string): string {
  return (mimeType || "").split(";")[0].trim().toLowerCase();
}

/** Round reported duration; do not fabricate seconds from an assumed codec bitrate. */
export function billableDurationSeconds(
  audioBase64: string,
  claimedDurationSeconds: number,
): number {
  const hasPayload = base64Payload(audioBase64).length > 0;
  const claimed = Number.isFinite(claimedDurationSeconds)
    ? Math.max(0, Math.ceil(claimedDurationSeconds))
    : 0;
  return Math.max(claimed, hasPayload ? 1 : 0);
}

export function resolveVoiceLimits(
  settings: Record<string, string | undefined>,
  plan: string,
): VoicePlanLimits {
  const read = (key: string, fallback: number): number => {
    const parsed = parseInt(settings[key] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const monthly: Record<string, number> = {
    free: read("voice_limit_free", 300),
    pro: read("voice_limit_pro", 1800),
    ultra: read("voice_limit_ultra", 0),
  };
  const perRequest: Record<string, number> = {
    free: read("voice_per_req_free", 60),
    pro: read("voice_per_req_pro", 180),
    ultra: read("voice_per_req_ultra", 300),
  };
  // Reading `voice_limit_free` for every plan is what made a Pro subscription buy no
  // extra seconds on the endpoint the app uses. The plan selects the row.
  const key = Object.prototype.hasOwnProperty.call(monthly, plan) ? plan : "free";
  return { monthly: monthly[key], perRequest: perRequest[key] };
}

export function checkVoiceIntake(input: VoiceIntakeInput): VoiceIntakeVerdict {
  const payload = base64Payload(input.audioBase64);
  const billableSeconds = billableDurationSeconds(input.audioBase64, input.claimedDurationSeconds);
  const unlimited = input.limits.monthly <= 0;
  const remainingAfter = unlimited
    ? -1
    : Math.max(0, input.limits.monthly - input.usedSeconds - billableSeconds);

  const reject = (reason: VoiceRejection, message: string): VoiceIntakeVerdict => ({
    allowed: false,
    reason,
    message,
    billableSeconds,
    remainingAfter,
  });

  if (payload.length > MAX_AUDIO_BASE64_LENGTH) {
    return reject(
      "payload_too_large",
      "حجم الملف الصوتي كبير جداً. يرجى إرسال تسجيل أصغر من 10 ميجابايت.",
    );
  }

  const mime = normalizeAudioMime(input.mimeType);
  if (!ALLOWED_AUDIO_TYPES.has(mime)) {
    return reject(
      "unsupported_media_type",
      "صيغة الملف الصوتي دي مش مدعومة. سجّل من التطبيق أو ابعت ملف WebM أو MP3 أو M4A.",
    );
  }

  if (!Number.isFinite(input.claimedDurationSeconds) || input.claimedDurationSeconds <= 0) {
    return reject("invalid_duration", "مدة التسجيل غير صالحة. جرّب تسجيل الصوت مرة تانية.");
  }

  if (billableSeconds > input.limits.perRequest) {
    return reject(
      "per_request_limit",
      `مدة التسجيل الواحد لا يمكن أن تتجاوز ${input.limits.perRequest} ثانية في خطتك الحالية.`,
    );
  }

  if (!unlimited && input.usedSeconds >= input.limits.monthly) {
    return reject(
      "monthly_limit_reached",
      `وقت التسجيل الصوتي المتاح ليك خلص (${input.limits.monthly} ثانية/شهر). يرجى الترقية لـ Pro للحصول على المزيد!`,
    );
  }

  if (!unlimited && input.usedSeconds + billableSeconds > input.limits.monthly) {
    return reject(
      "monthly_limit_exceeded",
      `مدة هذا التسجيل تتجاوز الرصيد المتبقي لك هذا الشهر. المتاح الآن ${Math.max(
        0,
        input.limits.monthly - input.usedSeconds,
      )} ثانية فقط.`,
    );
  }

  return { allowed: true, billableSeconds, remainingAfter };
}

/**
 * Tokens to reserve for a transcription of this length.
 *
 * Shared so the two endpoints cannot charge differently for the same audio, which they
 * did: one estimated from the claimed duration and the payload size, the other did not
 * estimate at all before spending.
 */
export function estimateSpeechTokens(audioBase64: string, billableSeconds: number): number {
  return Math.max(
    80,
    Math.ceil(billableSeconds * 14) + Math.ceil(base64Payload(audioBase64).length / 18_000),
  );
}
