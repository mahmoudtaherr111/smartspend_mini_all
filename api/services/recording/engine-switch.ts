/**
 * Which engine records a sentence: setting `recording_engine`.
 *
 * `rules` (the default, and the answer for anything else) is the classification pipeline as it
 * has always run. `understanding` sends every typed and spoken sentence through one service
 * (`read-sentence.ts`): a model reads it and code verifies the reading
 * (docs/decisions/0052-understanding-engine.md).
 */
import { getSystemSettings } from "../../lib/settings-cache";
import { TRPCError } from "@trpc/server";

export type RecordingEngine = "rules" | "understanding";

export function recordingEngineOf(settings: Record<string, string> | null | undefined): RecordingEngine {
  return settings?.recording_engine === "understanding" ? "understanding" : "rules";
}

/** A temporary settings outage cannot silently switch the classifier of a live account. */
export async function currentRecordingEngine(): Promise<RecordingEngine> {
  try {
    return recordingEngineOf(await getSystemSettings());
  } catch {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "مش قادرين نحمّل إعدادات التسجيل دلوقتي. جرّب كمان شوية." });
  }
}
