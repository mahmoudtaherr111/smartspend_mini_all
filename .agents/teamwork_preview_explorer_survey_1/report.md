# Voice & Audio Recording Subsystem Investigation Report

**Specialist**: Explorer 1 — Voice & Audio Recording State Machine Specialist  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/teamwork_preview_explorer_survey_1/`  
**Timestamp**: 2026-08-30T01:58:30+01:00  

---

## Executive Summary

The SmartSpend AI voice and audio recording subsystem operates across two primary architectural pathways:
1. **Single-Shot Voice Expense Recording (`ExpenseForm.tsx` & `api/ai-router.ts`)**: Captures user speech via `MediaRecorder`, performs client-side codec negotiation, enforces zero-duration and silent audio filters, converts recorded audio to Base64, and transmits to tRPC endpoints (`parseVoiceExpense` / `speechToText`) powered by Gemini Audio STT and Groq Whisper Large V3.
2. **Real-Time Interactive AI Voice Consultation (`useVoiceCall.ts`, `AIVoiceCall.tsx`, & `api/services/voice-call-service.ts`)**: Streams 16kHz Int16 linear PCM audio chunks over an authenticated, CSWSH-protected WebSocket (`/api/voice/live`) directly to the Google Gemini Live Multimodal API, supporting low-latency audio playback, dynamic voice tool execution, and session-limited duration management.

This investigation conducted a line-by-line audit across six critical reliability and state-machine dimensions:
- **Zero-length / Short / Silent Audio Handling**
- **Permission Denial & Dismissal States**
- **Backgrounding, Tab Switching, & Page Lifecycle**
- **Codec Fallback & Container Alignment Hierarchy**
- **Rapid Toggle & Race Condition Prevention**
- **Network Failure, Timeout Handling, & Infinite Spinner Prevention**

---

## Detailed Investigation Matrix & Findings

### Matrix 1: Zero-Length / Silent Audio Handling

#### 1.1 Frontend Single-Shot Audio (`ExpenseForm.tsx`)
- **Observations & Evidence**:
  - `src/components/expenses/ExpenseForm.tsx:751-769`:
    ```ts
    const totalBytes = audioChunksRef.current.reduce((acc, c) => acc + c.size, 0);
    if (audioChunksRef.current.length === 0 || totalBytes === 0 || durationRef.current === 0) {
      setIsRecording(false);
      setIsProcessingVoice(false);
      setFlowStage("idle");
      audioChunksRef.current = [];
      toast.info("التسجيل الصوتي قصير جداً أو لم يتم التقاط صوت.");
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
    if (audioBlob.size === 0) {
      setIsRecording(false);
      setIsProcessingVoice(false);
      setFlowStage("idle");
      audioChunksRef.current = [];
      toast.info("لم يتم تسجيل أي بيانات صوتية صالحة.");
      return;
    }
    ```
  - `src/components/expenses/ExpenseForm.tsx:778-781`:
    ```ts
    const base64Audio = result.split(",")[1];
    if (!base64Audio || base64Audio.trim().length === 0) {
      throw new Error("Empty audio base64 payload");
    }
    ```
- **State Machine Analysis**:
  - When a user taps record and instantly taps stop within <1 second (`durationRef.current === 0`) or before `ondataavailable` emits data (`totalBytes === 0`), `mediaRecorder.onstop` halts the flow immediately.
  - State is cleanly restored to `flowStage = "idle"`, `isRecording = false`, and `isProcessingVoice = false`.
  - No backend tRPC mutation is triggered, completely preventing unnecessary API quota consumption, rate-limit burning, or backend crash cascades.

#### 1.2 Backend Transcription Validation (`api/ai-router.ts`)
- **Observations & Evidence**:
  - `api/ai-router.ts:1679-1681`:
    ```ts
    if (!transcribedText || transcribedText.trim() === "") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "لم نتمكن من سماع شيء. حاول مرة أخرى." });
    }
    ```
- **State Machine Analysis**:
  - If a user sends a non-zero audio file that contains only background ambient silence, Gemini STT or Groq Whisper returns an empty or whitespace-only transcript. The backend cleanly throws a `BAD_REQUEST` with clear Arabic guidance, which `parseVoiceMutation.onError` maps to `toast.error` without crashing.

#### 1.3 Real-Time Live Audio Stream (`useVoiceCall.ts`)
- **Observations & Evidence**:
  - `src/hooks/useVoiceCall.ts:508-522`:
    ```ts
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
    ws.send(e.data);
    ```
  - `src/hooks/useVoiceCall.ts:171-173`:
    ```ts
    const byteLen = pcmData.byteLength;
    const safeByteLen = byteLen - (byteLen % 2);
    if (safeByteLen === 0) return;
    ```
- **State Machine Analysis**:
  - Live voice utilizes continuous 16kHz PCM streaming. This is vital for Gemini Live API's server-side Voice Activity Detection (VAD) and Acoustic Echo Cancellation (AEC).
  - The client calculates RMS on incoming audio buffers to detect user speech (threshold RMS > 200) and clear previous assistant subtitle text cleanly, while never dropping frames.
  - Playback validates incoming byte length and alignment before scheduling `AudioBufferSourceNode`, preventing audio decoding exceptions on empty or malformed packets.

---

### Matrix 2: Permission Denial & Dismissal States

#### 2.1 Expense Form Microphone Permissions (`ExpenseForm.tsx`)
- **Observations & Evidence**:
  - `src/components/expenses/ExpenseForm.tsx:678-686`:
    ```ts
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error(
        "متصفحك يمنع الوصول للميكروفون! يجب استخدام اتصال آمن (HTTPS) أو (Localhost).",
        { duration: 8000 }
      );
      return;
    }
    ```
  - `src/components/expenses/ExpenseForm.tsx:830-861`:
    ```ts
    const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
    const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "";
    if (
      name === "NotAllowedError" ||
      name === "PermissionDeniedError" ||
      msg.toLowerCase().includes("permission") ||
      msg.toLowerCase().includes("not allowed")
    ) {
      toast.error(
        "تم رفض إذن الميكروفون. يرجى تفعيل الصلاحية من إعدادات المتصفح للتسجيل الصوتي.",
        { duration: 6000 }
      );
    } else if (name === "NotFoundError" || msg.toLowerCase().includes("not found")) {
      toast.error("لم يتم العثور على ميكروفون متصل بالجهاز.");
    } else if (name === "NotReadableError" || msg.toLowerCase().includes("in use")) {
      toast.error("الميكروفون قيد الاستخدام في تطبيق آخر.");
    } else {
      toast.error("مقدرناش نسجّل الصوت، جرّب تاني أو تحقق من إعدادات الميكروفون.");
    }
    setIsRecording(false);
    setIsProcessingVoice(false);
    setFlowStage("error");
    setTimeout(() => setFlowStage("idle"), 100);
    ```
- **State Machine Analysis**:
  - Distinguishes permission rejections (`NotAllowedError`), missing hardware (`NotFoundError`), and hardware locks (`NotReadableError`).
  - Emits localized, actionable Arabic error toasts.
  - Automatically resets `flowStage` from `"error"` back to `"idle"` via a 100ms reset timer, unlocking the UI for text input or retry without requiring a page refresh.

#### 2.2 AI Voice Call Permissions (`useVoiceCall.ts` & `AIVoiceCall.tsx`)
- **Observations & Evidence**:
  - `src/hooks/useVoiceCall.ts:90-117`:
    ```ts
    function normalizeVoiceError(error: unknown): string {
      // ... maps NotAllowedError -> "محتاج تفتح إذن الميكروفون من المتصفح عشان نبدأ المكالمة الصوتية."
      // ... maps NotFoundError -> "مش لاقي ميكروفون متصل بالجهاز. وصل ميكروفون أو اختار جهاز إدخال صوت."
      // ... maps NotReadableError -> "الميكروفون مشغول في تطبيق تاني أو المتصفح مش قادر يفتحه حاليا."
      // ... maps WebSocket/Server -> "فشل الاتصال بخادم الصوت. جرّب تاني بعد لحظات."
    }
    ```
  - `src/hooks/useVoiceCall.ts:524-529`:
    ```ts
    catch (err: any) {
      setStatus("error");
      setErrorMessage(normalizeVoiceError(err));
      cleanupResources();
    }
    ```
  - `src/components/ai/AIVoiceCall.tsx:139`:
    ```ts
    const isIdle = status === "idle" || status === "ended" || status === "error";
    ```
  - `src/components/ai/AIVoiceCall.tsx:276-280`:
    ```tsx
    {status === "error" && errorMessage && (
      <div className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm text-center">
        {errorMessage}
      </div>
    )}
    ```
- **State Machine Analysis**:
  - Errors transition `status` directly to `"error"` and release all resources (`cleanupResources()`).
  - Because `isIdle` includes `"error"`, the view seamlessly presents the error banner above the retryable "ابدأ المكالمة" button, eliminating any infinite connecting/loading state.

---

### Matrix 3: Backgrounding / Tab Switch & Page Lifecycle

#### 3.1 Expense Form Tab Visibility Handling (`ExpenseForm.tsx`)
- **Observations & Evidence**:
  - `src/components/expenses/ExpenseForm.tsx:880-892`:
    ```ts
    useEffect(() => {
      if (!isRecording) return;
      const handleVisibilityChange = () => {
        if (document.hidden) {
          toast.info("تم إيقاف التسجيل الصوتي لمغادرة الصفحة.");
          stopRecording();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }, [isRecording]);
    ```
  - `src/components/expenses/ExpenseForm.tsx:894-914`:
    Component unmount effect halts active `mediaStreamRef.current` tracks, stops active `mediaRecorderRef.current`, and clears the interval timer.

#### 3.2 Live Voice Call Tab Visibility Handling (`useVoiceCall.ts`) — **[GAP IDENTIFIED]**
- **Observations & Evidence**:
  - `src/hooks/useVoiceCall.ts:547-551` includes component unmount cleanup:
    ```ts
    useEffect(() => {
      return () => {
        cleanupResources();
      };
    }, [cleanupResources]);
    ```
  - **Identified Gap**: `useVoiceCall.ts` does NOT bind to `visibilitychange` or `pagehide` during an active call.
  - **Impact**: If a user is connected to a real-time live voice call (`status === "connected"`) and switches to another browser tab or minimizes the browser/PWA on mobile, the microphone capture stream (`AudioWorklet`) and WebSocket connection to `/api/voice/live` remain open in the background, continuing to consume battery, microphone hardware access, and user monthly voice quota minutes.
  - **Contrast with Test Specification**: In `tests/voice-state-machine.test.ts:157-161`, `handleVisibilityChange(isHidden)` is explicitly defined and tested (Tier 2.3), confirming the intended architectural contract is for backgrounding to cancel/end the session.

---

### Matrix 4: Codec Fallback & Container Alignment Hierarchy

#### 4.1 Frontend Codec Negotiation (`ExpenseForm.tsx`)
- **Observations & Evidence**:
  - `src/components/expenses/ExpenseForm.tsx:49-65`:
    ```ts
    function probeAudioCodec(): string | undefined {
      if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
        return undefined;
      }
      const hierarchy = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
      ];
      for (const mime of hierarchy) {
        if (MediaRecorder.isTypeSupported(mime)) {
          return mime;
        }
      }
      return undefined;
    }
    ```
  - Correctly negotiates WebM Opus on Chromium/Android, MP4/AAC on iOS Safari / WebKit, and falls back gracefully.

#### 4.2 Backend STT Pipeline & Container Mismatch (`api/ai-router.ts`) — **[GAP IDENTIFIED]**
- **Observations & Evidence**:
  - `api/ai-router.ts:200-204`:
    ```ts
    // Groq Audio API (Whisper)
    const audioBuffer = Buffer.from(base64Audio, "base64");
    const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    ```
  - **Identified Gap**: The `FormData` file name is hardcoded to `"audio.webm"`.
  - When an iOS Safari client records audio in `audio/mp4` or `audio/aac`, `mimeType` is `"audio/mp4"`, but the multipart upload filename submitted to Groq's `/openai/v1/audio/transcriptions` endpoint is `"audio.webm"`.
  - Certain OpenAI / Groq Whisper endpoints inspect the filename extension (`.webm` vs `.mp4` vs `.wav`) rather than MIME header to instantiate the audio demuxer, triggering format demuxing errors on Safari recordings when Groq Whisper is selected as the primary STT model.
  - **Contrast with Test Specification**: `tests/voice-state-machine.test.ts:230-263` proves that container resolution (`resolveAudioContainer`) must map `audio/mp4` -> `recording.mp4` and `audio/wav` -> `recording.wav`.

#### 4.3 Real-Time Live Voice PCM Pipeline (`useVoiceCall.ts`)
- **Observations & Evidence**:
  - `src/hooks/useVoiceCall.ts:34-88`: Inline `PCMProcessor` `AudioWorklet` takes raw audio samples from the microphone, applies linear interpolation to convert whatever native hardware sample rate is present (e.g. 44.1kHz or 48kHz) down to 16kHz Int16 linear PCM, and emits 2048-sample Int16 buffers.
  - This avoids container formats completely, eliminating cross-browser codec incompatibilities in the real-time WebSocket pathway.

---

### Matrix 5: Rapid Toggle & Race Condition Prevention

#### 5.1 Expense Form Race Conditions (`ExpenseForm.tsx`)
- **Observations & Evidence**:
  - **Debounce Guard**: `isDebounced(400)` (lines 626–633) prevents rapid multiple clicks from firing multiple `getUserMedia` requests.
  - **Cancel Decoupling**: `cancelRecording()` (line 636) explicitly ignores the debounce timer, ensuring the user can abort immediately at any time.
  - **Stop Decoupling**: `stopRecording()` (line 865) is decoupled from debounce lockout, ensuring an active recording can always be stopped.
  - **Monotonic Session ID & Cancel Flag**:
    - `activeAudioSessionIdRef.current` (line 689) increments on every start or cancel.
    - If user clicks "Record" and immediately clicks "Cancel" while the browser permission prompt is still open:
      When `navigator.mediaDevices.getUserMedia` finally resolves (line 697), `isCancelledRef.current || currentSessionId !== activeAudioSessionIdRef.current` evaluates to `true`.
      All acquired tracks are immediately stopped (`track.stop()`), preventing the browser recording dot/microphone indicator from being left active.
  - **Hardware Track Disconnection Listener**:
    - Lines 709–719:
      ```ts
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.addEventListener("ended", () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            try { mediaRecorderRef.current.stop(); } catch {}
          }
        });
      }
      ```
      If the user unplugs their headset, switches Bluetooth audio devices, or revokes OS microphone access mid-recording, the track fires `ended`, safely terminating the `MediaRecorder` and invoking processing or cleanup rather than stalling.

#### 5.2 Live Voice Call Race Conditions (`useVoiceCall.ts`)
- **Observations & Evidence**:
  - Monotonic `activeCallIdRef.current` (line 290) and `isCallActiveRef.current` (line 287).
  - Validation checkpoints exist:
    1. After `getUserMedia` (line 312)
    2. After `audioWorklet.addModule` (line 348)
    3. Before `new WebSocket()` (line 382)
  - If `endCall()` is triggered during setup, `activeCallIdRef.current` is zeroed (line 534) and `cleanupResources()` tears down all allocated nodes. Any pending asynchronous setup steps halt immediately and stop media tracks.

---

### Matrix 6: Network Failure & Timeout Handling

#### 6.1 Expense Form Transcription Upload (`ExpenseForm.tsx`) — **[GAP IDENTIFIED]**
- **Observations & Evidence**:
  - In `src/components/expenses/ExpenseForm.tsx:782-789`:
    ```ts
    setIsProcessingVoice(true);
    setFlowStage("processing");
    parseVoiceMutation.mutate({
      audioBase64: base64Audio,
      mimeType: actualMimeType,
      durationSeconds: Math.max(1, durationRef.current),
    });
    ```
  - **Identified Gap**: `parseVoiceMutation` does NOT set an explicit timeout or AbortController.
  - **Impact**: If the network connection drops or the backend proxy/gateway hangs indefinitely during transcription, `isProcessingVoice` remains `true` and the form remains locked in dynamic loading messages (`"المعالجة الذكية..."`) with inputs disabled (`isSubmitting = true`), creating an infinite spinner condition until the user reloads the page.

#### 6.2 Live Voice Call & WebSocket Security (`api/services/voice-call-service.ts`, `api/server.ts`, `api/boot.ts`)
- **Observations & Evidence**:
  - **CSWSH Origin Validation**: `api/server.ts:41-59` and `api/boot.ts:150-203` validate the `Origin` header using `isAllowedWebSocketOrigin` before upgrading the WebSocket connection, defeating Cross-Site WebSocket Hijacking attacks.
  - **Session & Limits Enforcement**: `api/services/voice-call-service.ts:197-270` validates session tokens and checks monthly duration limits before establishing Gemini Live connections.
  - **Server-side Session Timers**:
    - Max duration timer: Lines 398–401 automatically terminate the call session and close the socket when the user's allocated limit is reached.
    - Warning timer: Lines 405–409 broadcast a warning message 10 seconds before cutoff.
    - Upstream Gemini Live timeout: Lines 476–481 enforce a 5-second connection timeout to Google's WebSocket API.

---

## Synthesis of Gaps & Remediation Proposals

| Issue ID | Severity | Location | Root Cause | Proposed Remediation |
|---|---|---|---|---|
| **GAP-VOICE-01** | **Medium** | `src/hooks/useVoiceCall.ts` | Missing `visibilitychange` & `pagehide` event listener | Register `visibilitychange` listener in `useVoiceCall.ts` to cleanly invoke `endCall()` when `document.hidden` is true. |
| **GAP-VOICE-02** | **Medium** | `api/ai-router.ts:203` | Hardcoded `"audio.webm"` in Groq Whisper `FormData` | Use `resolveAudioContainer(mimeType)` to map `audio/mp4` to `recording.mp4`, `audio/wav` to `recording.wav`, and `audio/webm` to `recording.webm`. |
| **GAP-VOICE-03** | **Medium** | `src/components/expenses/ExpenseForm.tsx:782` | Missing timeout on `parseVoiceMutation` | Implement a 30-second client-side timeout guard to reset `isProcessingVoice = false` and `flowStage = "idle"` if the mutation hangs. |

---

## Detailed Remediation Blueprints

### Blueprint 1: Add `visibilitychange` Lifecycle to `useVoiceCall.ts`
```ts
// In src/hooks/useVoiceCall.ts
useEffect(() => {
  if (status !== "connected" && status !== "connecting" && status !== "warning") {
    return;
  }
  const handleVisibility = () => {
    if (document.hidden) {
      console.log("[Voice Call] Tab backgrounded, ending call session.");
      endCall();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handleVisibility);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", handleVisibility);
  };
}, [status, endCall]);
```

### Blueprint 2: Container-Aligned Multi-Codec Payload in `api/ai-router.ts`
```ts
// In api/ai-router.ts:runSTTPipeline
function resolveAudioFilename(mime: string): string {
  const lower = (mime || "").toLowerCase();
  if (lower.includes("mp4") || lower.includes("aac") || lower.includes("m4a")) return "audio.mp4";
  if (lower.includes("wav")) return "audio.wav";
  if (lower.includes("ogg") || lower.includes("opus")) return "audio.ogg";
  return "audio.webm";
}

if (isGroqModel(modelName)) {
  const audioBuffer = Buffer.from(base64Audio, "base64");
  const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
  const filename = resolveAudioFilename(mimeType);
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("model", modelName);
  formData.append("prompt", prompt);
  formData.append("language", "ar");
  // ...
}
```

### Blueprint 3: Timeout Guard for `parseVoiceMutation` in `ExpenseForm.tsx`
```ts
// In src/components/expenses/ExpenseForm.tsx
const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Inside mediaRecorder.onstop before mutating:
if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
voiceTimeoutRef.current = setTimeout(() => {
  if (isProcessingVoice) {
    setIsProcessingVoice(false);
    setFlowStage("idle");
    toast.error("استغرقت معالجة التسجيل الصوتي وقتاً طويلاً. يرجى المحاولة مرة أخرى.");
  }
}, 30_000);

// In parseVoiceMutation onSuccess & onError callbacks:
if (voiceTimeoutRef.current) {
  clearTimeout(voiceTimeoutRef.current);
  voiceTimeoutRef.current = null;
}
```

---

## Conclusion

The SmartSpend AI voice and audio subsystem demonstrates high architectural maturity, with solid state machines, robust permission error normalization, hardware disconnection event listeners, and CSWSH origin security. Addressing the three identified gaps (`visibilitychange` in `useVoiceCall`, dynamic filename alignment for Groq Whisper, and client-side mutation timeout in `ExpenseForm`) will ensure complete fault tolerance and resilience across mobile, desktop, and varied network environments.
