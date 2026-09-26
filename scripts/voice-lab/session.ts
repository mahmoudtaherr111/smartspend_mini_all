import WebSocket from "ws";
import { buildSetup, field, isInteractionComplete, object, readUsage, toolReply } from "./protocol";
import type { JsonObject, SetupOptions } from "./protocol";
import type { TurnMeasurement } from "./metrics";

export interface LabTurn { id: string; text: string; audio?: { pcm: Buffer; sampleRate: number } }
export interface LabSessionOptions extends SetupOptions {
  apiKey: string;
  apiVersion: "v1alpha" | "v1beta";
  turns: LabTurn[];
  toolHandler: (name: string, args: JsonObject, turn: LabTurn) => JsonObject;
  timeoutMs?: number;
  sessionTimeoutMs?: number;
}
export interface LabSessionResult {
  status: "completed" | "failed";
  failure: string | null;
  measurements: TurnMeasurement[];
  syntheticTranscripts: { turnId: string; input: string; output: string }[];
  setupMs: number | null;
  elapsedMs: number;
  interruptedEvents: number;
  resumptionUpdates: number;
  protocolEvents: { atMs: number; keys: string[]; contentKeys: string[]; interactionStatus: unknown }[];
}

/** Synthetic fixtures only. No DB imports, account tokens, application writes, or saved audio. */
export async function runLabSession(options: LabSessionOptions): Promise<LabSessionResult> {
  if (options.turns.length === 0 || options.turns.length > 10) throw new Error("Expected 1–10 synthetic turns");
  const started = performance.now();
  const result: LabSessionResult = {
    status: "failed", failure: null, measurements: [], syntheticTranscripts: [],
    setupMs: null, elapsedMs: 0, interruptedEvents: 0, resumptionUpdates: 0, protocolEvents: [],
  };
  return new Promise(resolve => {
    const ws = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${options.apiVersion}.GenerativeService.BidiGenerateContent`,
      { headers: { "x-goog-api-key": options.apiKey }, handshakeTimeout: 15_000, maxPayload: 4 * 1024 * 1024 },
    );
    let finished = false;
    let index = -1;
    let current: TurnMeasurement | null = null;
    let currentStarted = 0;
    let inputEnded = 0;
    let awaitingToolAudio = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let inputTimer: ReturnType<typeof setTimeout> | undefined;
    const sessionDeadline = setTimeout(() => finish("session_timeout"), options.sessionTimeoutMs ?? 180_000);

    function finish(failure: string | null) {
      if (finished) return;
      finished = true;
      for (const timer of [settleTimer, deadline, inputTimer, sessionDeadline]) clearTimeout(timer);
      result.failure = failure;
      result.status = failure ? "failed" : "completed";
      result.elapsedMs = Math.round(performance.now() - started);
      ws.removeAllListeners();
      // A timeout during CONNECTING must still have an error listener when terminate aborts the handshake.
      ws.on("error", () => undefined);
      ws.terminate();
      resolve(result);
    }

    function send(message: JsonObject) {
      if (!finished && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    }

    function next() {
      if (finished) return;
      clearTimeout(settleTimer);
      clearTimeout(deadline);
      index += 1;
      if (index === options.turns.length) { finish(null); return; }
      const turn = options.turns[index];
      currentStarted = performance.now();
      inputEnded = currentStarted;
      awaitingToolAudio = false;
      current = { id: turn.id, firstAudioMs: null, durationMs: null,
        inputAudioSeconds: 0, outputAudioSeconds: 0, inputTranscriptCharacters: 0,
        outputTranscriptCharacters: 0, usage: [], tools: [], completed: false };
      result.measurements.push(current);
      result.syntheticTranscripts.push({ turnId: turn.id, input: "", output: "" });
      deadline = setTimeout(() => finish("turn_timeout"), options.timeoutMs ?? 40_000);
      if (turn.audio) {
        const { pcm, sampleRate } = turn.audio;
        if (pcm.length % 2 || ![16_000, 24_000].includes(sampleRate) || pcm.length > sampleRate * 2 * 30) {
          finish("invalid_synthetic_audio"); return;
        }
        current.inputAudioSeconds = pcm.length / (2 * sampleRate);
        send({ realtimeInput: { activityStart: {} } });
        let offset = 0;
        const chunkSize = sampleRate * 2 / 20; // Real-time 50 ms chunks; never dump an entire recording at once.
        const stream = () => {
          if (finished) return;
          if (offset >= pcm.length) {
            inputEnded = performance.now();
            send({ realtimeInput: { activityEnd: {} } });
            return;
          }
          send({ realtimeInput: { audio: {
            data: pcm.subarray(offset, offset + chunkSize).toString("base64"), mimeType: `audio/pcm;rate=${sampleRate}`,
          } } });
          offset += chunkSize;
          inputTimer = setTimeout(stream, 50);
        };
        stream();
      } else {
        send({ clientContent: { turns: [{ role: "user", parts: [{ text: turn.text }] }], turnComplete: true } });
      }
    }

    ws.on("open", () => send(buildSetup(options)));
    ws.on("message", raw => {
      if (finished) return;
      let message: JsonObject;
      try { message = object(JSON.parse(raw.toString())); }
      catch { finish("invalid_provider_json"); return; }
      const eventContent = object(field(message, "serverContent", "server_content"));
      const status = field(message, "interactionStatus", "interaction_status") ?? field(eventContent, "interactionStatus", "interaction_status");
      if (result.protocolEvents.length < 500) result.protocolEvents.push({
        atMs: Math.round(performance.now() - started), keys: Object.keys(message), contentKeys: Object.keys(eventContent),
        interactionStatus: status === "IDLE" || status === "IN_PROGRESS" ? status : null,
      });
      if (message.error) { finish("provider_error"); return; }
      if (field(message, "setupComplete", "setup_complete")) {
        if (result.setupMs !== null) { finish("duplicate_setup"); return; }
        result.setupMs = Math.round(performance.now() - started);
        next(); return;
      }
      if (field(message, "sessionResumptionUpdate", "session_resumption_update")) result.resumptionUpdates++;
      if (field(message, "goAway", "go_away")) { finish("provider_go_away"); return; }
      if (!current) return;
      const usage = readUsage(message);
      if (usage) current.usage.push(usage);
      const content = object(field(message, "serverContent", "server_content"));
      if (content.interrupted) result.interruptedEvents++;
      const transcript = result.syntheticTranscripts[index];
      const inputText = object(field(content, "inputTranscription", "input_transcription")).text;
      const outputText = object(field(content, "outputTranscription", "output_transcription")).text;
      if (typeof inputText === "string") {
        current.inputTranscriptCharacters += inputText.length; transcript.input += inputText;
      }
      if (typeof outputText === "string") {
        current.outputTranscriptCharacters += outputText.length; transcript.output += outputText;
      }
      const parts = object(field(content, "modelTurn", "model_turn")).parts;
      if (Array.isArray(parts)) for (const part of parts) {
        const data = object(field(object(part), "inlineData", "inline_data"));
        const mimeType = field(data, "mimeType", "mime_type");
        if (typeof data.data !== "string" || typeof mimeType !== "string" || !mimeType.startsWith("audio/pcm")) continue;
        if (current.firstAudioMs === null) current.firstAudioMs = Math.round(performance.now() - inputEnded);
        const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] ?? 24_000);
        current.outputAudioSeconds += Buffer.from(data.data, "base64").length / (2 * rate);
        awaitingToolAudio = false;
      }
      const toolCall = object(field(message, "toolCall", "tool_call"));
      const calls = field(toolCall, "functionCalls", "function_calls");
      if (Array.isArray(calls)) {
        current.completed = false;
        awaitingToolAudio = calls.length > 0;
        clearTimeout(settleTimer);
        const responses: JsonObject[] = [];
        for (const rawCall of calls) {
          const call = object(rawCall);
          if (typeof call.id !== "string" || typeof call.name !== "string") { finish("invalid_tool_call"); return; }
          current.tools.push(call.name);
          if (current.tools.length > 8) { finish("tool_budget_exceeded"); return; }
          try {
            responses.push(toolReply(options.model, call.id, call.name,
              options.toolHandler(call.name, object(call.args), options.turns[index])));
          } catch { finish("fixture_error"); return; }
        }
        send({ toolResponse: { functionResponses: responses } });
      }
      if (isInteractionComplete(options.model, message) && !awaitingToolAudio) {
        current.completed = true;
        current.durationMs = Math.round(performance.now() - currentStarted);
      }
      if (current.completed) {
        // Usage/transcription can follow turnComplete. Keep the previous turn open during a quiet drain.
        clearTimeout(settleTimer);
        settleTimer = setTimeout(next, 1_250);
      }
    });
    ws.on("error", () => finish("transport_error"));
    ws.on("close", code => finish(result.setupMs === null ? `setup_rejected_${code}` : `closed_${code}`));
  });
}
