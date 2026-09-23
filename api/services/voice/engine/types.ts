/**
 * What the call needs from a speech model, whatever provider stands behind it. The gateway talks to this
 * interface only, so another engine (a different live model, or speech-to-text + text model + text-to-speech)
 * can replace Gemini Live without the call, its tools or its checks changing.
 */

export type ThinkingLevel = "low" | "medium" | "high";
export type ToolScheduling = "INTERRUPT" | "WHEN_IDLE" | "SILENT";

/** A tool as the model sees it: a name, when to use it, and JSON-schema parameters. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface EngineSetup {
  /** Provider model id, already through `mapModelName`. */
  model: string;
  voiceName: string;
  systemInstruction: string;
  tools: ToolDeclaration[];
  /** Only read by models with configurable thinking. */
  thinkingLevel?: ThinkingLevel;
  /** Context the provider keeps before it starts dropping the oldest turns. */
  compression: { triggerTokens: number; targetTokens: number };
  /** Continue an earlier provider session (after a dropped connection) instead of starting a new one. */
  resumptionHandle?: string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  response: Record<string, unknown>;
  /** How the model should take a late result; ignored by engines that cannot schedule. */
  scheduling?: ToolScheduling;
}

/** Token counts of one model response, by direction and modality ("text", "audio"). */
export interface EngineUsage {
  input: Record<string, number>;
  output: Record<string, number>;
  thoughts: number;
  /** Totals as the provider reported them, for reconciling with the modality counts. */
  promptTotal: number;
  responseTotal: number;
}

export type EngineEvent =
  | { type: "ready" }
  | { type: "audio"; pcm: Buffer; sampleRate: number }
  | { type: "input_transcript"; text: string }
  | { type: "output_transcript"; text: string }
  | { type: "tool_calls"; calls: ToolCallRequest[] }
  | { type: "tool_cancel"; ids: string[] }
  | { type: "interrupted" }
  /** The model finished speaking a turn (it may still be working, see `idle`). */
  | { type: "turn_complete" }
  /** Nothing is in progress any more: the user may speak. */
  | { type: "idle" }
  | { type: "usage"; usage: EngineUsage }
  | { type: "resumption"; handle: string }
  /** The provider connection dropped and the engine is reconnecting on its own. */
  | { type: "reconnecting" }
  | { type: "reconnected" }
  /** The engine stopped for good; `resumable` says whether a new engine can continue with the last handle. */
  | { type: "closed"; reason: string; resumable: boolean };

export interface VoiceEngine {
  readonly name: string;
  connect(setup: EngineSetup): Promise<void>;
  /** 16 kHz 16-bit mono PCM of the user speaking. */
  sendAudio(pcm: Buffer): void;
  /** The user stopped speaking (the app's voice detection): answer now rather than wait for silence. */
  endOfSpeech(): void;
  /** A user turn in text: typed input, or a note from the app to the model, which interrupts it. */
  sendText(text: string): void;
  sendToolResults(results: ToolCallResult[]): void;
  close(): void;
  onEvent(listener: (event: EngineEvent) => void): void;
}
