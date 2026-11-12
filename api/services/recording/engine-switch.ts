/**
 * Which engine records a sentence: setting `recording_engine`.
 *
 * `rules` (the default, and the answer for anything else) is the classification pipeline as it
 * has always run. `understanding` sends every typed and spoken sentence through one service
 * (`read-sentence.ts`): a model reads it and code verifies the reading
 * (docs/decisions/0052-understanding-engine.md).
 */
import { getSystemSettings } from "../../lib/settings-cache";

export type RecordingEngine = "rules" | "understanding";

export function recordingEngineOf(settings: Record<string, string> | null | undefined): RecordingEngine {
  return settings?.recording_engine === "understanding" ? "understanding" : "rules";
}

/** The engine now in force. A settings outage answers `rules`, whose own reads then fail as they always did. */
export async function currentRecordingEngine(): Promise<RecordingEngine> {
  try {
    return recordingEngineOf(await getSystemSettings());
  } catch {
    return "rules";
  }
}
