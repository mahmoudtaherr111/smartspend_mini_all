import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runLabSession } from "./session";
import { summarizeMeasurements } from "./metrics";
import type { ProviderRates } from "./metrics";
import type { LiveModel } from "./protocol";
import { LAB_INSTRUCTION, LAB_TOOLS, MEASUREMENT_TURNS, answerLabTool } from "./fixtures";
import { labReportPath, writeLabReport } from "./io";

async function main() {
  const { values } = parseArgs({ options: {
    model: { type: "string", default: "gemini-3.8-live" },
    "api-version": { type: "string", default: "v1beta" },
    turns: { type: "string", default: "6" },
    compression: { type: "boolean", default: false },
    thinking: { type: "string", default: "low" },
    "trigger-tokens": { type: "string", default: "4096" },
    "target-tokens": { type: "string", default: "2048" },
    rates: { type: "string" }, json: { type: "string" },
  } });
  const model = values.model as LiveModel;
  if (!["gemini-3.8-live", "gemini-3.8-live-extended-thinking"].includes(model)) throw new Error("unsupported_model");
  if (!["v1alpha", "v1beta"].includes(values["api-version"]!)) throw new Error("unsupported_api_version");
  if (!["low", "medium", "high"].includes(values.thinking!)) throw new Error("invalid_thinking_level");
  const turnCount = Number(values.turns);
  const triggerTokens = Number(values["trigger-tokens"]);
  const targetTokens = Number(values["target-tokens"]);
  if (!Number.isInteger(turnCount) || turnCount < 1 || turnCount > 10) throw new Error("turns_must_be_1_to_10");
  if (![triggerTokens, targetTokens].every(Number.isSafeInteger) || targetTokens < 512 || targetTokens >= triggerTokens || triggerTokens > 32768) throw new Error("invalid_compression_window");
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY_missing");
  // Reports contain only synthetic transcripts, but keep them out of tracked docs and the terminal anyway.
  const reportPath = labReportPath(values.json);
  const rates: ProviderRates | null = values.rates ? JSON.parse(readFileSync(values.rates, "utf8")) : null;
  const result = await runLabSession({ apiKey: key, model,
    apiVersion: values["api-version"] as "v1alpha" | "v1beta",
    turns: MEASUREMENT_TURNS.slice(0, turnCount),
    systemInstruction: LAB_INSTRUCTION, tools: LAB_TOOLS, toolHandler: answerLabTool,
    thinking: values.thinking as "low" | "medium" | "high",
    compression: values.compression!, triggerTokens, targetTokens,
  });
  const summary = summarizeMeasurements(result.measurements, rates);
  const report = { schemaVersion: 1, measuredAt: new Date().toISOString(), scope: "provider_only_synthetic",
    model, inputMode: "text", requestedTurns: turnCount, compression: values.compression, triggerTokens, targetTokens, rates, ...result, summary };
  writeLabReport(reportPath, report);
  console.log(JSON.stringify({ model, status: result.status, failure: result.failure, summary, reportPath }, null, 2));
  if (result.status !== "completed") process.exitCode = 1;
}

main().catch(error => {
  // Never print a provider error, request URL, key, or transcript.
  console.error(error instanceof Error && /^[a-zA-Z_0-9]+$/.test(error.message) ? error.message : "voice_lab_failed");
  process.exitCode = 1;
});
