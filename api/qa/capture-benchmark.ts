/**
 * Live benchmark of capture's reading (decision 0049): every case goes through the production path (privacy, the
 * one-time-code drop, number labels, the model, the checks, the posting) with a real model, and is scored against
 * what the case expects. Prints case ids, outcomes and totals; never message text, so a private corpus of real
 * messages can be scored on the owner's machine without leaving it.
 *
 *   npm run bench:capture -- --cases api/qa/fixtures/capture-heldout-v9.json [--model gemini-3.5-flash-lite] [--parallel 2]
 *
 * A case: { id, sender, text, expect: { post, flow?, egp?, fee?, own?, review? } }. Models: gemini-* on GEMINI_API_KEY,
 * or groq:<model> on GROQ_API_KEY.
 */
import "dotenv/config";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { executeLlmChain, type LlmRoute, type StructuredSchema } from "../lib/llm-router";
import {
  CAPTURE_MODEL_REPLY_SCHEMA, CAPTURE_PROMPT_VERSION, CAPTURE_SYSTEM_PROMPT, captureUserPrompt, checkCaptureReply, labelAmounts,
  parseCaptureReply, proposeCapturePosting, type CapturePostingProposal,
} from "../lib/capture/model-contract";
import { looksLikeOneTimeCode, prepareCaptureText, preparedCaptureMessage } from "../lib/capture/privacy";

const pounds = z.string().regex(/^\d+\.\d{2}$/);
const caseSchema = z.object({
  id: z.string().regex(/^[A-Z0-9_-]{1,24}$/),
  sender: z.string().max(40).nullable().optional(),
  text: z.string().min(1).max(2000),
  expect: z.object({ post: z.boolean(), flow: z.enum(["in", "out"]).optional(), egp: pounds.optional(), fee: pounds.optional(), own: z.boolean().optional(), review: z.boolean().optional() }),
});
export type CaptureCase = z.infer<typeof caseSchema>;
const corpusSchema = z.object({ cases: z.array(caseSchema).min(1).max(10_000) });

/** Whether a proposal is what the case expects. Own moves are scored on the posting being marked own, not its flow. */
export function scoreCase(expect: CaptureCase["expect"], got: CapturePostingProposal | { status: "dropped"; reason: string }): boolean {
  if (expect.review) return got.status === "waiting";
  if (!expect.post) return got.status === "no_posting" || got.status === "dropped";
  if (got.status !== "ready") return false;
  return got.principalEgp === expect.egp && got.feeEgp === (expect.fee ?? "0.00")
    && (expect.own ? got.ownership === "own" : got.flow === expect.flow && got.ownership !== "own");
}

export function routeFor(model: string, env: NodeJS.ProcessEnv = process.env): LlmRoute {
  if (model.startsWith("groq:")) {
    return { slug: "groq", protocol: "openai", baseUrl: "https://api.groq.com/openai/v1", apiKey: env.GROQ_API_KEY ?? "", model: model.slice(5), priority: 1, suppressReasoning: true, timeoutMs: 30000 };
  }
  return { slug: "gemini", protocol: "gemini", baseUrl: "", apiKey: env.GEMINI_API_KEY ?? "", model, priority: 1, timeoutMs: 30000 };
}

/** One case through the production path. */
export async function readCase(route: LlmRoute, item: CaptureCase): Promise<{ got: CapturePostingProposal | { status: "dropped"; reason: string }; latencyMs: number }> {
  const prepared = prepareCaptureText(item.text);
  if (!prepared.ok) return { got: { status: "dropped", reason: prepared.codes.includes("otp") ? "otp" : "redaction_failed" }, latencyMs: 0 };
  if (looksLikeOneTimeCode(prepared.value.text)) return { got: { status: "dropped", reason: "otp" }, latencyMs: 0 };
  const labelled = labelAmounts(preparedCaptureMessage(prepared.value));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const reply = await executeLlmChain([route], {
        systemPrompt: CAPTURE_SYSTEM_PROMPT, userPrompt: captureUserPrompt(labelled, item.sender ?? null), schema: CAPTURE_MODEL_REPLY_SCHEMA as StructuredSchema,
        maxOutputTokens: 600, temperature: 0, lowThinking: true, timeoutMs: 30000, deadlineMs: 40000,
      });
      return { got: proposeCapturePosting(checkCaptureReply(parseCaptureReply(reply.text), labelled)), latencyMs: reply.latencyMs };
    } catch (error) {
      lastError = error;
      // Free tiers answer 429 in bursts: wait and ask again rather than score an outage as a reading.
      await new Promise((done) => setTimeout(done, 5000 * (attempt + 1)));
    }
  }
  void lastError;
  return { got: { status: "dropped", reason: "provider_failed" }, latencyMs: 0 };
}

async function main(args: string[]): Promise<number> {
  const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
  const file = option("--cases");
  if (!file) { process.stderr.write("Usage: npm run bench:capture -- --cases <json> [--model <id>] [--parallel <n>]\n"); return 2; }
  let corpus: z.infer<typeof corpusSchema>;
  try {
    const path = resolve(file);
    if (statSync(path).size > 20 * 1024 * 1024) throw new Error("too_big");
    corpus = corpusSchema.parse(JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")));
  } catch {
    // The corpus can be private: no parser errors, paths or text.
    process.stderr.write("Capture benchmark refused: invalid, oversized or unreadable cases.\n");
    return 2;
  }
  const model = option("--model") ?? "gemini-3.5-flash-lite";
  const route = routeFor(model);
  if (!route.apiKey) { process.stderr.write("No API key for this model in the environment.\n"); return 2; }
  const queue = [...corpus.cases];
  const results: Array<{ id: string; ok: boolean; status: string; detail: string; latencyMs: number }> = [];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, Number(option("--parallel") ?? 2))) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { got, latencyMs } = await readCase(route, item);
      const ok = scoreCase(item.expect, got);
      const detail = got.status === "ready" ? `${got.flow} ${got.ownership} ${got.principalEgp}+${got.feeEgp}`
        : got.status === "no_posting" ? got.state : got.status === "waiting" ? got.reason : got.status === "rejected" ? got.codes.join(",") : got.reason;
      results.push({ id: item.id, ok, status: got.status, detail, latencyMs });
      process.stdout.write(`${item.id} ${ok ? "PASS" : "FAIL"} ${got.status} ${detail}\n`);
    }
  }));
  const latencies = results.map((row) => row.latencyMs).filter(Boolean).sort((a, b) => a - b);
  const failed = results.filter((row) => !row.ok).map((row) => row.id).sort();
  process.stdout.write(`${JSON.stringify({ promptVersion: CAPTURE_PROMPT_VERSION, model, cases: results.length, passed: results.length - failed.length,
    providerFailures: results.filter((row) => row.detail === "provider_failed").length, failed,
    p50Ms: latencies[Math.floor(latencies.length / 2)] ?? null, p95Ms: latencies[Math.floor(latencies.length * 0.95)] ?? null })}\n`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
