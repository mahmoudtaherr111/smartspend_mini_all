import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { synthesizeLabSpeech } from "./tts";
import { runLabSession } from "./session";
import type { LabSessionResult } from "./session";
import { summarizeMeasurements } from "./metrics";
import type { ProviderRates } from "./metrics";
import type { LiveModel } from "./protocol";
import { LAB_INSTRUCTION, LAB_TOOLS, MEASUREMENT_TURNS, answerLabTool } from "./fixtures";
import { labReportPath, writeLabReport } from "./io";

async function main() {
  const { values } = parseArgs({ options: {
    "tts-model": { type: "string", default: "gemini-3.1-flash-tts-preview" },
    turns: { type: "string", default: "4" },
    rates: { type: "string" }, json: { type: "string" }, compression: { type: "boolean", default: false },
  } });
  const path = labReportPath(values.json);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY_missing");
  const count = Number(values.turns);
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("turns_must_be_1_to_10");
  const rates: ProviderRates | null = values.rates ? JSON.parse(readFileSync(values.rates, "utf8")) : null;
  const turns = [];
  const synthesisFailures: { turnId: string; reason: string }[] = [];
  const ttsStarted = performance.now();
  for (const turn of MEASUREMENT_TURNS.slice(0, count)) {
    try {
      const audio = await synthesizeLabSpeech(key, values["tts-model"]!, turn.text);
      turns.push({ ...turn, audio });
    } catch (error) {
      const reason = error instanceof Error && /^tts_[a-z_0-9]+$/.test(error.message) ? error.message : "tts_failed";
      synthesisFailures.push({ turnId: turn.id, reason });
      process.exitCode = 1;
      // Do not retry a quota failure or discard already paid-for synthetic speech.
      break;
    }
  }
  const ttsMs = Math.round(performance.now() - ttsStarted);
  const runs: (LabSessionResult & { model: LiveModel; summary: ReturnType<typeof summarizeMeasurements> })[] = [];
  const baseReport = { schemaVersion: 1, measuredAt: new Date().toISOString(), scope: "provider_only_synthetic",
    inputMode: "tts", ttsModel: values["tts-model"], ttsMs, ttsCostIncluded: false,
    compression: values.compression, rates, requestedTurns: count, synthesizedTurns: turns.length, synthesisFailures };
  writeLabReport(path, { ...baseReport, runs });
  if (!turns.length) {
    console.log(JSON.stringify({ status: "blocked", synthesisFailures, reportPath: path })); return;
  }
  const models: LiveModel[] = ["gemini-3.8-live", "gemini-3.8-live-extended-thinking"];
  // Same PCM bytes and scenarios, generated once. The lab intentionally changes only the Live model.
  for (const model of models) {
    const result = await runLabSession({ apiKey: key, model, apiVersion: "v1beta", turns,
      systemInstruction: LAB_INSTRUCTION, tools: LAB_TOOLS, toolHandler: answerLabTool,
      thinking: "low", compression: values.compression!, triggerTokens: 4096, targetTokens: 2048, manualVad: true,
    });
    const summary = summarizeMeasurements(result.measurements, rates);
    runs.push({ model, ...result, summary });
    writeLabReport(path, { ...baseReport, runs });
    console.log(JSON.stringify({ model, status: result.status, failure: result.failure, summary, reportPath: path }));
    if (result.status !== "completed") process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error && /^[a-zA-Z_0-9]+$/.test(error.message) ? error.message : "voice_lab_comparison_failed");
  process.exitCode = 1;
});
