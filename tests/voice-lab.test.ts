import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSetup, isInteractionComplete, readUsage, toolReply } from "../scripts/voice-lab/protocol";
import { summarizeMeasurements } from "../scripts/voice-lab/metrics";
import type { TurnMeasurement } from "../scripts/voice-lab/metrics";
import { buildCorpus, JOURNEYS, SYNTHETIC_CONVERSATIONS } from "../scripts/voice-lab/corpus";
import { evaluateRelease } from "../scripts/voice-lab/gates";
import type { ReleaseEvidence } from "../scripts/voice-lab/gates";
import { synthesizeLabSpeech } from "../scripts/voice-lab/tts";
import { labReportPath } from "../scripts/voice-lab/io";

describe("Live measurement protocol", () => {
  it("waits past generationComplete and intermediate thinking utterances", () => {
    expect(isInteractionComplete("gemini-3.8-live", { serverContent: { generationComplete: true } })).toBe(false);
    expect(isInteractionComplete("gemini-3.8-live", { server_content: { turn_complete: true } })).toBe(true);
    expect(isInteractionComplete("gemini-3.8-live-extended-thinking", { serverContent: { turnComplete: true } })).toBe(false);
    expect(isInteractionComplete("gemini-3.8-live-extended-thinking", { interaction_status: "IDLE" })).toBe(true);
    expect(isInteractionComplete("gemini-3.8-live-extended-thinking", { serverContent: { interactionStatus: "IDLE", turnComplete: true } })).toBe(true);
  });
  it("puts thinking config in generationConfig and omits unsupported scheduling", () => {
    const options = { model: "gemini-3.8-live-extended-thinking" as const, thinking: "low" as const,
      compression: true, triggerTokens: 4096, targetTokens: 2048, systemInstruction: "synthetic" };
    expect(buildSetup(options)).toMatchObject({ setup: {
      generationConfig: { thinkingConfig: { thinkingLevel: "LOW" } },
      inputAudioTranscription: {}, outputAudioTranscription: {}, sessionResumption: {},
    } });
    expect(buildSetup({ ...options, model: "gemini-3.8-live" })).not.toHaveProperty("setup.generationConfig.thinkingConfig");
    expect(toolReply(options.model, "1", "query", { ok: true })).not.toHaveProperty("response.scheduling");
    expect(toolReply("gemini-3.8-live", "1", "query", { ok: true })).toHaveProperty("response.scheduling", "WHEN_IDLE");
  });
  it("retains missing counts and combines repeated modalities", () => {
    expect(readUsage({})).toBeNull();
    const usage = readUsage({ usage_metadata: { prompt_token_count: 0, response_tokens_details: [
      { modality: "AUDIO", token_count: 20 }, { modality: "AUDIO", token_count: 30 },
    ] } });
    expect(usage).toMatchObject({ prompt: 0, response: null, responseModalities: { audio: 50 } });
  });
});

describe("measurement accounting", () => {
  const rates = { source: "fixture", checkedAt: "2026-09-22", inputPerMillion: { text: 1, audio: 3 }, outputPerMillion: { text: 4, audio: 12 } };
  const makeTurn = (): TurnMeasurement => ({ id: "one", firstAudioMs: 700, durationMs: 2000, inputAudioSeconds: 1,
    outputAudioSeconds: 2, inputTranscriptCharacters: 4, outputTranscriptCharacters: 4, tools: [], completed: true,
    usage: [{ prompt: 100, response: 50, total: 150, thoughts: 0, cached: 0,
      promptModalities: { text: 40, audio: 60 }, responseModalities: { audio: 50 } }] });
  it("prices audio as audio, not as text", () => {
    const result = summarizeMeasurements([makeTurn()], rates);
    expect(result.estimatedSessionUsd).toBeCloseTo(0.00082);
    expect(result.estimatedUsdPerAudioMinute).toBeCloseTo(0.0164);
  });
  it.each(["missing", "ambiguous", "mismatch", "thinking", "unfinished", "cache"])("refuses a fabricated cost for %s usage", kind => {
    const turn = makeTurn();
    if (kind === "missing") turn.usage = [];
    if (kind === "ambiguous") turn.usage.push(turn.usage[0]);
    if (kind === "mismatch") turn.usage[0].prompt = 200;
    if (kind === "thinking") turn.usage[0].thoughts = 20;
    if (kind === "unfinished") turn.completed = false;
    if (kind === "cache") turn.usage[0].cached = 10;
    expect(summarizeMeasurements([turn], rates).estimatedSessionUsd).toBeNull();
  });
  it("does not turn empty results into a zero-cost success", () => {
    const result = summarizeMeasurements([], rates);
    expect(result.estimatedSessionUsd).toBeNull();
    expect(result.firstAudioP95Ms).toBeNull();
  });
});

describe("Egyptian synthetic coverage", () => {
  const corpus = buildCorpus();
  it("has unique utterances across all six journeys with explicit synthetic provenance", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(corpus.map(c => c.text)).size).toBe(corpus.length);
    expect(new Set(corpus.map(c => c.id)).size).toBe(corpus.length);
    for (const journey of JOURNEYS) expect(corpus.filter(c => c.journey === journey).length).toBeGreaterThanOrEqual(50);
    expect(corpus.every(c => c.provenance === "synthetic_template" && !c.humanReviewed)).toBe(true);
  });
  it("covers money hazards and distinguishes understanding from consent", () => {
    const tags = new Set(corpus.flatMap(c => c.tags));
    for (const tag of ["ambiguous_number", "multi_item", "correction", "unrealized", "transfer", "withdrawal", "refund", "split_bill", "saving_circle", "installment"]) expect(tags.has(tag)).toBe(true);
    expect(SYNTHETIC_CONVERSATIONS.find(c => c.id === "not_confirmation")?.assertions).toContain("agreement_after_explanation_is_not_authorization");
  });
});

describe("release evidence", () => {
  const evidence: ReleaseEvidence = { scope: "application", humanClips: 300, humanSpeakers: 40,
    journeyResults: Object.fromEntries(JOURNEYS.map(j => [j, { attempted: 100, succeeded: 85 }])),
    inventedNumbers: 0, unintendedWrites: 0, firstAudioP95Ms: 1500, measuredUsdPerMinute: 0.1,
    adminCostCapUsdPerMinute: 0.2, egyptianSpeechReviewed: true, interruptionTested: true };
  it("passes only complete application evidence", () => expect(evaluateRelease(evidence).ready).toBe(true));
  it("cannot certify synthetic provider calls or absent human audio", () => {
    expect(evaluateRelease({ ...evidence, scope: "provider_only_synthetic" }).ready).toBe(false);
    expect(evaluateRelease({ ...evidence, humanClips: 0, humanSpeakers: 0 }).blockers).toContain("humanAudio");
  });
  it("does not substitute zero for an unmeasured cost or safety result", () => {
    const result = evaluateRelease({ ...evidence, inventedNumbers: null, unintendedWrites: null, measuredUsdPerMinute: null });
    expect(result.blockers).toEqual(expect.arrayContaining(["numbers", "writes", "cost"]));
  });
});

describe("synthetic audio and reports", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("accepts the provider's lowercase PCM MIME type without saving audio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: {
      parts: [{ inlineData: { mimeType: "audio/l16; rate=24000; channels=1", data: Buffer.alloc(480).toString("base64") } }],
    } }] }) }));
    const result = await synthesizeLabSpeech("test", "tts-test", "synthetic");
    expect(result.sampleRate).toBe(24000);
    expect(result.pcm.length).toBe(480);
  });
  it("fails without a retry or provider content leak when quota is exceeded", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetcher);
    await expect(synthesizeLabSpeech("test", "tts-test", "synthetic")).rejects.toThrow("tts_http_429");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not accept a successful HTTP response with no generated speech", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: "OTHER" }] }) }));
    await expect(synthesizeLabSpeech("test", "tts-test", "synthetic")).rejects.toThrow("tts_audio_missing_or_too_long");
  });
  it("keeps generated reports out of tracked source and docs", () => {
    expect(() => labReportPath("docs/report.json")).toThrow();
    expect(() => labReportPath(".agents/../report.json")).toThrow();
    expect(labReportPath(".agents/reports/sample.json")).toMatch(/sample\.json$/);
  });
});
