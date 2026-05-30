import { db } from "../queries/connection";
import { apiKeyErrors } from "../../db/schema";
import { eq, desc, and } from "drizzle-orm";

// ─── Error Type Constants ───
export const API_ERROR_TYPES = {
  INVALID_KEY: "invalid_key",
  QUOTA_EXCEEDED: "quota_exceeded",
  INSUFFICIENT_CREDIT: "insufficient_credit",
  RATE_LIMITED: "rate_limited",
  NETWORK_ERROR: "network_error",
  MODEL_NOT_FOUND: "model_not_found",
  PERMISSION_DENIED: "permission_denied",
  TIMEOUT: "timeout",
  UNKNOWN: "unknown",
} as const;

export type ApiErrorType =
  (typeof API_ERROR_TYPES)[keyof typeof API_ERROR_TYPES];

/**
 * Classify an HTTP status code + error message into a user-friendly error type.
 */
export function classifyApiError(
  statusCode: number | undefined,
  message: string,
): ApiErrorType {
  const msg = message.toLowerCase();
  if (
    statusCode === 401 ||
    msg.includes("invalid api key") ||
    msg.includes("api key not valid") ||
    msg.includes("unauthorized")
  ) {
    return API_ERROR_TYPES.INVALID_KEY;
  }
  if (
    statusCode === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  ) {
    return API_ERROR_TYPES.RATE_LIMITED;
  }
  if (
    statusCode === 403 ||
    msg.includes("permission denied") ||
    msg.includes("forbidden")
  ) {
    return API_ERROR_TYPES.PERMISSION_DENIED;
  }
  if (
    msg.includes("quota") ||
    msg.includes("exceeded") ||
    msg.includes("billing")
  ) {
    return API_ERROR_TYPES.QUOTA_EXCEEDED;
  }
  if (
    msg.includes("insufficient") ||
    msg.includes("no credit") ||
    msg.includes("payment required") ||
    statusCode === 402
  ) {
    return API_ERROR_TYPES.INSUFFICIENT_CREDIT;
  }
  if (
    msg.includes("model not found") ||
    msg.includes("not_found") ||
    statusCode === 404
  ) {
    return API_ERROR_TYPES.MODEL_NOT_FOUND;
  }
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnaborted")
  ) {
    return API_ERROR_TYPES.TIMEOUT;
  }
  if (
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("enotfound")
  ) {
    return API_ERROR_TYPES.NETWORK_ERROR;
  }
  return API_ERROR_TYPES.UNKNOWN;
}

/**
 * Log an API key error to the database.
 * @param provider - "gemini" | "groq" | "stt"
 * @param keyLabel - Which key setting was used (e.g., "gemini_api_key", "groq_api_key_free")
 * @param error - The caught error object
 * @param userId - Optional user ID that triggered the error
 */
export async function logApiKeyError(
  provider: string,
  keyLabel: string,
  error: unknown,
  userId?: number,
) {
  try {
    const err = error as any;
    const message = err?.message || err?.toString?.() || "Unknown error";
    const httpStatus =
      err?.status || err?.statusCode || err?.response?.status || null;
    const errorType = classifyApiError(httpStatus, message);

    await db.insert(apiKeyErrors).values({
      provider,
      keyLabel,
      errorType,
      message: message.substring(0, 2000), // cap message length
      httpStatus,
      userId: userId ?? null,
      resolved: false,
    });

    console.warn(
      `[API Key Error Logged] provider=${provider}, key=${keyLabel}, type=${errorType}, msg=${message.substring(0, 200)}`,
    );
  } catch (logErr) {
    // If even the logging itself fails, don't crash the pipeline
    console.error("[Error Logger] Failed to log API key error:", logErr);
  }
}

/**
 * Get all API key errors, optionally filtered.
 */
export async function getApiKeyErrors(opts?: {
  unresolvedOnly?: boolean;
  limit?: number;
}) {
  const limit = opts?.limit ?? 100;
  const conditions = opts?.unresolvedOnly
    ? [eq(apiKeyErrors.resolved, false)]
    : [];

  const rows = await db
    .select()
    .from(apiKeyErrors)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(apiKeyErrors.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Mark an error as resolved.
 */
export async function resolveApiKeyError(errorId: number) {
  await db
    .update(apiKeyErrors)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(apiKeyErrors.id, errorId));
}

/**
 * Mark ALL unresolved errors as resolved (clear all).
 */
export async function resolveAllApiKeyErrors() {
  await db
    .update(apiKeyErrors)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(apiKeyErrors.resolved, false));
}
