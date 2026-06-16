import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Sparkles, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useVoiceCall, type VoiceTraceEvent } from "@/hooks/useVoiceCall";
import { useHaptics } from "@/hooks/useHaptics";

const VOICES = [
  { id: "Aoede", label: "Olivia", gender: "أنثى" },
  { id: "Kore", label: "Sarah", gender: "أنثى" },
  { id: "Charon", label: "James", gender: "ذكر" },
] as const;

type VoiceQaToolName = "finance_query" | "memory_search" | "action_draft";

const VOICE_QA_TOOLS = new Set<VoiceQaToolName>(["finance_query", "memory_search", "action_draft"]);

function isVoiceQaTool(value: string | null): value is VoiceQaToolName {
  return value !== null && VOICE_QA_TOOLS.has(value as VoiceQaToolName);
}

function qaNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function qaPositiveInt(value: string | null, max: number): number | undefined {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, max);
}

function pickQaParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function buildVoiceQaArgs(toolName: VoiceQaToolName, params: URLSearchParams): Record<string, unknown> {
  if (toolName === "memory_search") {
    return {
      query: pickQaParam(params, "voice_qa_query") ?? "remember my recent saving plan",
      limit: qaPositiveInt(params.get("voice_qa_limit"), 8) ?? 5,
    };
  }

  if (toolName === "action_draft") {
    return {
      actionName: "goal.create",
      message: pickQaParam(params, "voice_qa_message") ?? "create a savings goal for 100000 EGP",
      title: pickQaParam(params, "voice_qa_title") ?? "Voice QA goal",
      targetAmount: qaNumber(params.get("voice_qa_target")) ?? 100000,
      targetDate: pickQaParam(params, "voice_qa_date"),
      description: pickQaParam(params, "voice_qa_description"),
    };
  }

  const period = pickQaParam(params, "voice_qa_period") ?? "today";
  const kind = pickQaParam(params, "voice_qa_kind") ?? "summary";
  return {
    kind,
    period,
    category: pickQaParam(params, "voice_qa_category"),
    granularity: pickQaParam(params, "voice_qa_granularity"),
    limit: qaPositiveInt(params.get("voice_qa_limit"), 20),
    startDate: pickQaParam(params, "voice_qa_start"),
    endDate: pickQaParam(params, "voice_qa_end"),
  };
}

function extractTrpcBatchPayload(data: unknown): Record<string, unknown> {
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== "object") return {};
  const entry = first as Record<string, unknown>;
  if (entry.error && typeof entry.error === "object") {
    const message = (entry.error as { message?: unknown }).message;
    throw new Error(typeof message === "string" ? message : "Voice QA request failed");
  }

  const result = entry.result && typeof entry.result === "object" ? (entry.result as Record<string, unknown>) : entry;
  const dataNode = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : result;
  const jsonNode = dataNode.json && typeof dataNode.json === "object" ? (dataNode.json as Record<string, unknown>) : dataNode;
  return jsonNode;
}

async function runVoiceToolQaRequest(
  toolName: VoiceQaToolName,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const token = typeof window !== "undefined" ? localStorage.getItem("local_auth_token") : "";
  const response = await fetch("/api/trpc/ai.runVoiceToolQa?batch=1", {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      0: {
        toolName,
        args,
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Voice QA request failed with HTTP ${response.status}`);
  }
  return extractTrpcBatchPayload(JSON.parse(text));
}

export default function AIVoiceCall() {
  const [selectedVoice, setSelectedVoice] = useState("Aoede");
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [voiceQaTrace, setVoiceQaTrace] = useState<VoiceTraceEvent[]>([]);
  const [voiceQaSessionId, setVoiceQaSessionId] = useState("");
  const [voiceQaStatus, setVoiceQaStatus] = useState("");
  const voiceQaSentRef = useRef<string | null>(null);
  const { mediumTap } = useHaptics();

  const {
    status,
    errorMessage,
    isMuted,
    elapsedSeconds,
    aiText,
    activeModel,
    voiceSessionId,
    voiceTrace,
    startCall,
    endCall,
    toggleMute,
  } = useVoiceCall();

  const isIdle = status === "idle" || status === "ended" || status === "error";
  const isConnecting = status === "connecting";
  const isConnected = status === "connected" || status === "warning";

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const currentVoice = VOICES.find((v) => v.id === selectedVoice) || VOICES[0];

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const toolName = params.get("voice_qa_tool");
    if (!isVoiceQaTool(toolName)) return;

    const args = buildVoiceQaArgs(toolName, params);
    const qaKey = `${toolName}:${JSON.stringify(args)}`;
    if (voiceQaSentRef.current?.startsWith(`${qaKey}:`)) return;

    const requestId = `${qaKey}:${Date.now()}`;
    voiceQaSentRef.current = requestId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("voice_qa_timeout_45s"), 45_000);

    setVoiceQaStatus(`running:${toolName}`);
    setVoiceQaSessionId("");
    setVoiceQaTrace([
      {
        type: "tool_execution",
        at: new Date().toISOString(),
        toolName,
      },
    ]);

    runVoiceToolQaRequest(toolName, args, controller.signal)
      .then((record) => {
        if (voiceQaSentRef.current !== requestId) return;
        const dataNeeds = Array.isArray(record.dataNeeds) ? record.dataNeeds.map(String) : [];
        const cacheHits = Array.isArray(record.cacheHits) ? record.cacheHits.map(String) : [];
        const traceEvent: VoiceTraceEvent = {
          type: "tool_result",
          at: new Date().toISOString(),
          toolName: typeof record.toolName === "string" ? record.toolName : toolName,
          ok: record.ok === true,
          dataNeeds,
          cacheHits,
          retrievalPolicy:
            record.retrievalPolicy && typeof record.retrievalPolicy === "object"
              ? (record.retrievalPolicy as VoiceTraceEvent["retrievalPolicy"])
              : undefined,
          cacheRuntime:
            record.cacheRuntime && typeof record.cacheRuntime === "object"
              ? (record.cacheRuntime as VoiceTraceEvent["cacheRuntime"])
              : undefined,
          embeddingCalls: Number.isFinite(Number(record.embeddingCalls))
            ? Number(record.embeddingCalls)
            : undefined,
          embeddingApiStatus:
            typeof record.embeddingApiStatus === "string" ? record.embeddingApiStatus : undefined,
          factCount: Number.isFinite(Number(record.factCount)) ? Number(record.factCount) : undefined,
          artifactCount: Number.isFinite(Number(record.artifactCount)) ? Number(record.artifactCount) : undefined,
          error: typeof record.error === "string" ? record.error : undefined,
        };

        setVoiceQaSessionId(String(record.voiceSessionId ?? ""));
        setVoiceQaTrace((prev) => [...prev.slice(-5), traceEvent]);
        setVoiceQaStatus(`success:${toolName}:${traceEvent.embeddingApiStatus ?? "unknown"}`);
      })
      .catch((error: unknown) => {
        if (voiceQaSentRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : String(error);
        setVoiceQaTrace((prev) => [
          ...prev.slice(-5),
          {
            type: "tool_result",
            at: new Date().toISOString(),
            toolName,
            ok: false,
            error: message,
          },
        ]);
        setVoiceQaStatus(`error:${toolName}`);
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      if (voiceQaSentRef.current === requestId) {
        voiceQaSentRef.current = null;
      }
      controller.abort();
    };
  }, []);

  const handleStartCall = () => {
    mediumTap();
    startCall(selectedVoice);
  };

  const handleEndCall = () => {
    mediumTap();
    endCall();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-6 space-y-6">
      {/* ── Idle State ── */}
      {isIdle && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center space-y-6 w-full max-w-sm"
        >
          {/* Avatar */}
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-2xl">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-4 border-background flex items-center justify-center">
              <Phone className="w-3 h-3 text-white" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold">مستشارك المالي الصوتي</h3>
            <p className="text-sm text-muted-foreground mt-1">
              اتكلم مع سمارت وناقش مصاريفك بالصوت
            </p>
          </div>

          {/* Error display */}
          {status === "error" && errorMessage && (
            <div className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm text-center">
              {errorMessage}
            </div>
          )}

          {/* Voice Selector */}
          <div className="w-full">
            <button
              type="button"
              onClick={() => setShowVoiceSelector(!showVoiceSelector)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30 text-sm"
            >
              <span>الصوت: {currentVoice.label} ({currentVoice.gender})</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", showVoiceSelector && "rotate-180")} />
            </button>
            <AnimatePresence>
              {showVoiceSelector && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-1"
                >
                  <div className="space-y-1 p-1">
                    {VOICES.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => {
                          setSelectedVoice(voice.id);
                          setShowVoiceSelector(false);
                        }}
                        className={cn(
                          "w-full text-start p-2.5 rounded-lg text-sm transition-colors",
                          selectedVoice === voice.id
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                            : "hover:bg-muted",
                        )}
                      >
                        {voice.label} ({voice.gender})
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Start Call Button */}
          <Button
            onClick={handleStartCall}
            size="lg"
            className="tap-target active-press w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all"
          >
            <Phone className="w-5 h-5 ml-2" />
            ابدأ المكالمة
          </Button>
        </motion.div>
      )}

      {/* ── Connecting State ── */}
      {isConnecting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center space-y-4"
        >
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center animate-pulse">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">جاري الاتصال...</p>
        </motion.div>
      )}

      {/* ── Connected State ── */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center space-y-6 w-full max-w-sm"
        >
          {/* Status + Timer */}
          <div className="flex items-center gap-2 text-sm">
            <span className={cn(
              "w-2 h-2 rounded-full",
              status === "warning" ? "bg-amber-500 animate-pulse" : "bg-emerald-500",
            )} />
            <span className="text-muted-foreground">
              {status === "warning" ? "المكالمة قاربت تخلص" : "متصل"}
            </span>
            <span className="font-mono text-foreground font-bold">{formatTime(elapsedSeconds)}</span>
          </div>

          {/* Animated Avatar with Waveform */}
          <div className="relative flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-2xl">
              <Sparkles className="w-10 h-10 text-white" />
            </div>

            {/* Voice waveform */}
            <div className="voice-wave text-emerald-500 mt-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} />
              ))}
            </div>
          </div>

          {/* Subtitle Area */}
          {showSubtitles && aiText && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full p-4 rounded-xl glass-card text-sm leading-relaxed text-center selectable-text max-h-32 overflow-y-auto"
            >
              {aiText}
            </motion.div>
          )}

          {(activeModel || voiceSessionId || voiceTrace.length > 0) && (
            <VoiceTracePanel
              activeModel={activeModel}
              voiceSessionId={voiceSessionId}
              voiceTrace={voiceTrace}
            />
          )}

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={cn(
                "tap-target h-12 w-12 rounded-full transition-colors",
                showSubtitles && "bg-indigo-500/10 border-indigo-500/30 text-indigo-600",
              )}
              title={showSubtitles ? "إخفاء النص" : "عرض النص"}
            >
              <span className="text-xs font-bold">CC</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={cn(
                "tap-target h-12 w-12 rounded-full transition-colors",
                isMuted && "bg-red-500/10 border-red-500/30 text-red-600",
              )}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>

            <Button
              size="icon"
              onClick={handleEndCall}
              className="tap-target active-press h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>
        </motion.div>
      )}

      {voiceQaStatus && (
        <div
          className="w-full max-w-sm rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground"
          aria-label={`voice-qa-status ${voiceQaStatus}`}
        >
          Voice QA: {voiceQaStatus}
        </div>
      )}

      {voiceQaTrace.length > 0 && (
        <VoiceTracePanel
          activeModel="voice-tool-qa"
          voiceSessionId={voiceQaSessionId}
          voiceTrace={voiceQaTrace}
        />
      )}
    </div>
  );
}

function shortTraceText(value: unknown, maxLength = 76): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function fallbackEmbeddingCalls(cacheHits: string[]): number {
  if (cacheHits.some((hit) => hit.startsWith("memory_cache:hit"))) return 0;
  return cacheHits.includes("embedding:query_embedded") && cacheHits.includes("embedding:fireworks") ? 1 : 0;
}

function VoiceTracePanel({
  activeModel,
  voiceSessionId,
  voiceTrace,
}: {
  activeModel: string;
  voiceSessionId: string;
  voiceTrace: ReturnType<typeof useVoiceCall>["voiceTrace"];
}) {
  const toolResults = voiceTrace.filter((event) => event.type === "tool_result");
  const latestTool = toolResults[toolResults.length - 1];
  const embeddingHits = latestTool?.cacheHits?.filter((hit) => hit.startsWith("embedding:")) ?? [];
  const embeddingCalls = latestTool
    ? latestTool.embeddingCalls ?? fallbackEmbeddingCalls(latestTool.cacheHits ?? [])
    : 0;
  const embeddingApiStatus = latestTool?.embeddingApiStatus ?? (embeddingCalls > 0 ? "fireworks_live_call" : "skipped");
  const retrievalEmbedding =
    latestTool?.retrievalPolicy?.embedding ?? (embeddingHits.length > 0 ? "fireworks_qwen" : "skipped");
  const cacheBackend = latestTool?.cacheRuntime?.backend ?? "unknown";
  const summary = latestTool
    ? `${latestTool.toolName ?? "tool"} · facts ${latestTool.factCount ?? 0} · embed ${embeddingCalls}`
    : activeModel || "ready";

  return (
    <details
      className="w-full rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground"
      aria-label={`voice-trace model=${activeModel || "unknown"} tool=${latestTool?.toolName ?? "none"} retrieval=${retrievalEmbedding} embedding=${embeddingHits.join(",") || "none"} embeddingCalls=${embeddingCalls} embeddingApiStatus=${embeddingApiStatus} cache=${cacheBackend}`}
    >
      <summary className="cursor-pointer select-none font-medium text-foreground/80">
        Voice trace: {summary}
      </summary>
      <div className="mt-2 grid gap-1.5">
        {activeModel && (
          <div className="flex items-center justify-between gap-3">
            <span>model</span>
            <span className="truncate text-end">{activeModel}</span>
          </div>
        )}
        {voiceSessionId && (
          <div className="flex items-center justify-between gap-3">
            <span>session</span>
            <span className="truncate text-end font-mono">{voiceSessionId}</span>
          </div>
        )}
        {voiceTrace.slice(-6).map((event, index) => (
          <div key={`${event.type}-${event.at}-${index}`} className="border-t border-border/40 pt-1">
            <div className="flex items-center justify-between gap-3">
              <span>{event.type}</span>
              <span className="truncate text-end">{shortTraceText(event.toolName ?? event.modelName)}</span>
            </div>
            {event.dataNeeds && event.dataNeeds.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span>tools</span>
                <span className="truncate text-end">{event.dataNeeds.join(", ")}</span>
              </div>
            )}
            {event.cacheHits && event.cacheHits.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span>cache</span>
                <span className="truncate text-end">{event.cacheHits.join(", ")}</span>
              </div>
            )}
            {event.retrievalPolicy && (
              <div className="flex items-center justify-between gap-3">
                <span>retrieval policy</span>
                <span className="truncate text-end">
                  {event.retrievalPolicy.embedding ?? "unknown"}
                  {typeof event.retrievalPolicy.vectorRows === "number" ? ` / rows ${event.retrievalPolicy.vectorRows}` : ""}
                  {typeof event.retrievalPolicy.dimensions === "number" ? ` / dim ${event.retrievalPolicy.dimensions}` : ""}
                  {event.retrievalPolicy.reason ? ` / ${event.retrievalPolicy.reason}` : ""}
                </span>
              </div>
            )}
            {event.cacheRuntime && (
              <div className="flex items-center justify-between gap-3">
                <span>cache backend</span>
                <span className="truncate text-end">
                  {event.cacheRuntime.backend ?? "unknown"}
                  {event.cacheRuntime.redisConfigured === false ? " / redis off" : ""}
                  {typeof event.cacheRuntime.memoryEntries === "number" ? ` / ram ${event.cacheRuntime.memoryEntries}` : ""}
                </span>
              </div>
            )}
            {event.type === "tool_result" && (
              <div className="flex items-center justify-between gap-3">
                <span>facts</span>
                <span className="truncate text-end">
                  {event.factCount ?? 0} facts · {event.artifactCount ?? 0} artifacts · embed {event.embeddingCalls ?? fallbackEmbeddingCalls(event.cacheHits ?? [])} · {event.ok ? "ok" : "failed"}
                </span>
              </div>
            )}
            {event.embeddingApiStatus && (
              <div className="flex items-center justify-between gap-3">
                <span>embedding API</span>
                <span className="truncate text-end">{event.embeddingApiStatus}</span>
              </div>
            )}
            {event.error && (
              <div className="flex items-center justify-between gap-3 text-red-500">
                <span>error</span>
                <span className="truncate text-end">{event.error}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
