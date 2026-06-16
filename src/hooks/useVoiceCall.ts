import { useState, useEffect, useRef, useCallback } from "react";

export type CallStatus = "idle" | "connecting" | "connected" | "warning" | "error" | "ended";

export interface VoiceTraceEvent {
  type: "ready" | "tool_execution" | "tool_result";
  at: string;
  toolName?: string;
  modelName?: string;
  voiceSessionId?: string;
  ok?: boolean;
  dataNeeds?: string[];
  cacheHits?: string[];
  retrievalPolicy?: {
    embedding?: string;
    reason?: string;
    vectorRows?: number;
    dimensions?: number;
  };
  cacheRuntime?: {
    backend?: string;
    redisConfigured?: boolean;
    redisConnected?: boolean;
    memoryEntries?: number;
  };
  embeddingCalls?: number;
  embeddingApiStatus?: string;
  factCount?: number;
  artifactCount?: number;
  error?: string;
}

// Inline AudioWorklet processor as a Blob URL to avoid needing a separate file
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(8192); // Pre-allocated buffer to prevent GC pauses
    this._bufferLength = 0;
    this._targetSampleRate = 16000;
    this._phase = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const samples = input[0];
    
    // sampleRate is a global in AudioWorklet containing the context's sampleRate (e.g. 48000)
    const ratio = sampleRate / this._targetSampleRate;
    
    while (this._phase < samples.length) {
      const index = Math.floor(this._phase);
      const nextIndex = index + 1 < samples.length ? index + 1 : index;
      const weight = this._phase - index;
      
      // Linear interpolation
      const sample = samples[index] * (1 - weight) + samples[nextIndex] * weight;
      
      // Convert float32 to Int16
      const s = Math.max(-1, Math.min(1, sample));
      const int16Val = s < 0 ? s * 0x8000 : s * 0x7fff;
      
      if (this._bufferLength < this._buffer.length) {
        this._buffer[this._bufferLength++] = int16Val;
      }
      
      this._phase += ratio;
    }
    this._phase -= samples.length;
    
    // Chunk and send
    const chunkSize = 2048;
    while (this._bufferLength >= chunkSize) {
      const chunk = new Int16Array(chunkSize);
      chunk.set(this._buffer.subarray(0, chunkSize));
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
      
      if (this._bufferLength > chunkSize) {
        this._buffer.copyWithin(0, chunkSize, this._bufferLength);
      }
      this._bufferLength -= chunkSize;
    }
    
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

function normalizeVoiceError(error: unknown): string {
  const name = typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name) : "";
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error ?? "");
  const combined = `${name} ${message}`.toLowerCase();

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    combined.includes("permission denied") ||
    combined.includes("not allowed")
  ) {
    return "محتاج تفتح إذن الميكروفون من المتصفح عشان نبدأ المكالمة الصوتية.";
  }
  if (name === "NotFoundError" || combined.includes("requested device not found")) {
    return "مش لاقي ميكروفون متصل بالجهاز. وصل ميكروفون أو اختار جهاز إدخال صوت.";
  }
  if (name === "NotReadableError" || combined.includes("could not start audio source")) {
    return "الميكروفون مشغول في تطبيق تاني أو المتصفح مش قادر يفتحه حاليا.";
  }
  if (combined.includes("websocket") || combined.includes("server") || combined.includes("خادم")) {
    return "فشل الاتصال بخادم الصوت. جرّب تاني بعد لحظات.";
  }

  return "حصل خطأ أثناء بدء المكالمة. راجع إذن الميكروفون وجرب مرة تانية.";
}

export function useVoiceCall() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [aiText, setAiText] = useState<string>("");
  const [activeModel, setActiveModel] = useState<string>("");
  const [voiceSessionId, setVoiceSessionId] = useState<string>("");
  const [voiceTrace, setVoiceTrace] = useState<VoiceTraceEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isCallActiveRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const nextPlayTimeRef = useRef(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const workletBlobUrlRef = useRef<string | null>(null);
  const userHasSpokenRef = useRef(false);
  const activeCallIdRef = useRef(0);

  // Analyser nodes for visualization (exposed via ref for external use)
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null); // permanent output gain node

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // ---- Audio Playback ----
  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try { src.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (audioCtxRef.current) {
      nextPlayTimeRef.current = audioCtxRef.current.currentTime;
    }
  }, []);

  const playAudioChunk = useCallback((pcmData: ArrayBuffer, sampleRate = 24000) => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) return;

    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    const byteLen = pcmData.byteLength;
    const safeByteLen = byteLen - (byteLen % 2);
    if (safeByteLen === 0) return;

    const int16 = new Int16Array(pcmData, 0, safeByteLen / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const buffer = audioCtx.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // Connect source → permanent gain node (which is already wired to destination)
    // Never connect analyser to destination here — that causes audio doubling
    const gainNode = outputGainRef.current;
    if (gainNode) {
      source.connect(gainNode);
    } else {
      source.connect(audioCtx.destination);
    }

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };

    const now = audioCtx.currentTime;
    const preRollDelay = 0.15; // 150ms buffer/pre-roll to absorb network jitter

    if (nextPlayTimeRef.current < now) {
      // If playback hasn't started or fell behind due to jitter, schedule with a pre-roll delay
      nextPlayTimeRef.current = now + preRollDelay;
    }

    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  }, []);

  // ---- Cleanup ----
  const cleanupResources = useCallback(() => {
    isCallActiveRef.current = false;

    stopPlayback();
    setAiText("");
    setActiveModel("");
    setVoiceSessionId("");
    setVoiceTrace([]);
    userHasSpokenRef.current = false;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch (e) {}
      workletNodeRef.current = null;
    }

    if (inputAnalyserRef.current) {
      try { inputAnalyserRef.current.disconnect(); } catch (e) {}
      inputAnalyserRef.current = null;
    }

    if (outputAnalyserRef.current) {
      try { outputAnalyserRef.current.disconnect(); } catch (e) {}
      outputAnalyserRef.current = null;
    }

    if (outputGainRef.current) {
      try { outputGainRef.current.disconnect(); } catch (e) {}
      outputGainRef.current = null;
    }

    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch (e) {}
      micSourceRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => {
        try {
          t.enabled = false;
          t.stop();
        } catch(e){}
      });
      micStreamRef.current = null;
    }

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close().catch(() => {}); } catch (e) {}
      audioCtxRef.current = null;
    }

    if (workletBlobUrlRef.current) {
      URL.revokeObjectURL(workletBlobUrlRef.current);
      workletBlobUrlRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, [stopPlayback]);

  // ---- Start Call ----
  const startCall = useCallback(async (voice = "Aoede") => {
    if (isCallActiveRef.current) return;
    isCallActiveRef.current = true;

    const callId = ++activeCallIdRef.current; // Track unique call execution ID

    setStatus("connecting");
    setErrorMessage(null);
    setElapsedSeconds(0);
    setAiText("");
    setActiveModel("");
    setVoiceSessionId("");
    setVoiceTrace([]);
    userHasSpokenRef.current = false;
    nextPlayTimeRef.current = 0;

    try {
      // 1. Request microphone at native rate to prevent browser resampling bugs on Windows/Chrome
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (callId !== activeCallIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = stream;

      // 2. Create AudioContext with latencyHint optimized for interactive real-time voice calls
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ latencyHint: "interactive" }); // running at native system rate
      if (audioCtx.state === "suspended") await audioCtx.resume();
      audioCtxRef.current = audioCtx;

      // 3. Analyser nodes
      const inputAnalyser = audioCtx.createAnalyser();
      inputAnalyser.fftSize = 128;
      inputAnalyserRef.current = inputAnalyser;

      const outputAnalyser = audioCtx.createAnalyser();
      outputAnalyser.fftSize = 128;
      outputAnalyserRef.current = outputAnalyser;

      // Build the permanent output audio graph (done ONCE, not per-chunk):
      // source → gainNode → outputAnalyser → destination
      // The analyser taps the signal without creating a duplicate path
      const outputGain = audioCtx.createGain();
      outputGain.gain.value = 1.0;
      outputGainRef.current = outputGain;
      outputGain.connect(outputAnalyser);
      outputAnalyser.connect(audioCtx.destination);

      // 4. Setup AudioWorklet (replaces deprecated ScriptProcessor)
      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      workletBlobUrlRef.current = blobUrl;
      await audioCtx.audioWorklet.addModule(blobUrl);

      if (callId !== activeCallIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(inputAnalyser);
      micSourceRef.current = micSource; // Store in ref to disconnect later

      const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
      workletNodeRef.current = workletNode;
      inputAnalyser.connect(workletNode);
      // Don't connect worklet to destination (avoid feedback)

      // 5. Connect WebSocket
      const token = localStorage.getItem("local_auth_token") || "";
      let wsUrl = "";
      
      const viteApiUrl = (import.meta as any).env?.VITE_API_URL;
      if (viteApiUrl) {
        try {
          const parsedUrl = new URL(viteApiUrl);
          const wsProtocol = parsedUrl.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${wsProtocol}//${parsedUrl.host}/api/voice/live?token=${encodeURIComponent(token)}&voice=${encodeURIComponent(voice)}`;
        } catch (e) {
          console.warn("[Voice Call] Invalid VITE_API_URL format:", viteApiUrl);
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${protocol}//${window.location.host}/api/voice/live?token=${encodeURIComponent(token)}&voice=${encodeURIComponent(voice)}`;
        }
      } else {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${protocol}//${window.location.host}/api/voice/live?token=${encodeURIComponent(token)}&voice=${encodeURIComponent(voice)}`;
      }

      if (callId !== activeCallIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[Voice Call] WebSocket opened.");
      };

      ws.onmessage = (event) => {
        if (!isCallActiveRef.current) return;

        if (event.data instanceof ArrayBuffer) {
          // Binary PCM audio from Gemini (24kHz, 16-bit, mono)
          playAudioChunk(event.data, 24000);
        } else {
          try {
            const msg = JSON.parse(event.data as string);

            if (msg.error) {
              console.error("[Voice Call] Server error:", msg.error);
              setStatus("error");
              setErrorMessage(normalizeVoiceError(msg.error));
              cleanupResources();
            } else if (msg.status === "ready") {
              setStatus("connected");
              if (msg.modelName) setActiveModel(msg.modelName);
              if (msg.voiceSessionId) setVoiceSessionId(String(msg.voiceSessionId));
              setVoiceTrace((prev) => [
                ...prev.slice(-10),
                {
                  type: "ready",
                  at: new Date().toISOString(),
                  modelName: msg.modelName ? String(msg.modelName) : undefined,
                  voiceSessionId: msg.voiceSessionId ? String(msg.voiceSessionId) : undefined,
                },
              ]);
              if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = setInterval(() => {
                setElapsedSeconds((p) => p + 1);
              }, 1000);
            } else if (msg.status === "warning") {
              setStatus("warning");
            } else if (msg.status === "limit_reached") {
              setStatus("ended");
              cleanupResources();
            } else if (msg.status === "interrupted") {
              stopPlayback();
              setAiText("");
            } else if (msg.type === "tool_execution") {
              setAiText(msg.message);
              setVoiceTrace((prev) => [
                ...prev.slice(-10),
                {
                  type: "tool_execution",
                  at: new Date().toISOString(),
                  toolName: msg.toolName ? String(msg.toolName) : undefined,
                },
              ]);
            } else if (msg.type === "voice_tool_result") {
              const payload = msg.payload && typeof msg.payload === "object"
                ? msg.payload as Record<string, unknown>
                : {};
              setVoiceTrace((prev) => [
                ...prev.slice(-10),
                {
                  type: "tool_result",
                  at: new Date().toISOString(),
                  toolName: typeof payload.toolName === "string" ? payload.toolName : undefined,
                  ok: payload.ok === true,
                  dataNeeds: Array.isArray(payload.dataNeeds) ? payload.dataNeeds.map(String) : [],
                  cacheHits: Array.isArray(payload.cacheHits) ? payload.cacheHits.map(String) : [],
                  retrievalPolicy: payload.retrievalPolicy && typeof payload.retrievalPolicy === "object"
                    ? payload.retrievalPolicy as VoiceTraceEvent["retrievalPolicy"]
                    : undefined,
                  cacheRuntime: payload.cacheRuntime && typeof payload.cacheRuntime === "object"
                    ? payload.cacheRuntime as VoiceTraceEvent["cacheRuntime"]
                    : undefined,
                  embeddingCalls: Number.isFinite(Number(payload.embeddingCalls)) ? Number(payload.embeddingCalls) : undefined,
                  embeddingApiStatus: typeof payload.embeddingApiStatus === "string" ? payload.embeddingApiStatus : undefined,
                  factCount: Number.isFinite(Number(payload.factCount)) ? Number(payload.factCount) : undefined,
                  artifactCount: Number.isFinite(Number(payload.artifactCount)) ? Number(payload.artifactCount) : undefined,
                  error: typeof payload.error === "string" ? payload.error : undefined,
                },
              ]);
            } else if (msg.type === "gemini_message") {
              const text = msg.payload?.serverContent?.modelTurn?.parts?.[0]?.text;
              if (text) {
                if (userHasSpokenRef.current) {
                  setAiText(text);
                  userHasSpokenRef.current = false;
                } else {
                  setAiText((prev) => prev + " " + text);
                }
              }
            }
          } catch (e) {
            // Unparseable — ignore
          }
        }
      };

      ws.onclose = (e) => {
        console.log(`[Voice Call] WebSocket closed. Code: ${e.code}`);
        setStatus((prev) => (prev === "error" ? "error" : "ended"));
        cleanupResources();
      };

      ws.onerror = (err) => {
        console.error("[Voice Call] WebSocket error:", err);
        setStatus("error");
        setErrorMessage("فشل الاتصال بخادم الصوت.");
        cleanupResources();
      };

      // 6. Hook worklet → send audio chunks via WebSocket when ready
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!isCallActiveRef.current) return;
        if (isMutedRef.current) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        // Calculate RMS of the incoming buffer to detect user speech for UI clearing
        const int16View = new Int16Array(e.data);
        let sumSq = 0;
        for (let i = 0; i < int16View.length; i++) {
          sumSq += int16View[i] * int16View[i];
        }
        const rms = Math.sqrt(sumSq / int16View.length);

        if (rms > 200) {
          userHasSpokenRef.current = true;
        }

        // ALWAYS send the audio chunk to maintain a continuous PCM stream
        // This allows Gemini's native VAD (Voice Activity Detection) and Echo Cancellation to work flawlessly
        ws.send(e.data);
      };

    } catch (err: any) {
      console.error("[Voice Call] Failed to start:", err);
      setStatus("error");
      setErrorMessage(normalizeVoiceError(err));
      cleanupResources();
    }
  }, [cleanupResources, playAudioChunk, stopPlayback]);

  // ---- End Call ----
  const endCall = useCallback(() => {
    activeCallIdRef.current = 0; // Invalidate any running startCall execution
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_call" }));
    }
    setStatus("ended");
    cleanupResources();
  }, [cleanupResources]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
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
    inputAnalyser: inputAnalyserRef.current,
    outputAnalyser: outputAnalyserRef.current,
  };
}
