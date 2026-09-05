# Comprehensive Audit & Edge-Case Discovery: Audio & Voice Recording (Web & PWA)

**Platform**: SmartSpend AI  
**Author**: Explorer 1 (`explorer_voice_audio`)  
**Date**: 2026-08-29  
**Status**: COMPLETE SURVEY & EDGE-CASE INVENTORY  

---

## Executive Summary

SmartSpend AI provides two distinct audio processing pipelines for Arabic-speaking users:
1. **Voice Expense Recording (STT + Classification)**: Single-shot microphone capture in `src/components/expenses/ExpenseForm.tsx`, converting recorded speech into Base64 audio blobs transmitted to backend tRPC endpoints (`api/ai-router.ts`: `parseVoiceExpense` and `speechToText`), utilizing Google Gemini Audio STT and Groq Whisper Large V3.
2. **AI Live Voice Call (Bidirectional Real-Time Streaming)**: Low-latency interactive voice consultation via `src/hooks/useVoiceCall.ts` and `src/components/ai/AIVoiceCall.tsx`, streaming 16kHz Int16 PCM audio chunks over WebSocket (`/api/voice/live`) directly to Google Gemini Live API with native tool invocation (`api/services/voice-call-service.ts`).

This investigation identified **8 critical/high-severity edge cases and vulnerabilities** across async lifecycle management, codec container mismatches, unvalidated WebSocket handshakes, unreactive visualizer state, debounce lockouts, and missing backgrounding/interruption handlers. Concrete state-machine refactoring architectures are detailed for production resilience across iOS Safari, Android Chrome, and Capacitor PWA environments.

---

## 1. Architectural Map of Voice & Audio Subsystems

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             FRONTEND LAYER (React 18 / PWA)                                     │
│                                                                                                                 │
│   [ExpenseForm.tsx]                                               [AIVoiceCall.tsx]                             │
│   - MediaRecorder API                                             - useVoiceCall.ts Hook                        │
│   - probeAudioCodec() (webm/opus, mp4, aac)                       - AudioContext (latencyHint: "interactive")   │
│   - Audio Chunks Ref -> Blob -> FileReader                        - Inline AudioWorklet ("pcm-processor")       │
│   - Duration timer & 60s max enforcement                          - AnalyserNodes & GainNode                    │
│   - tRPC Mutation: trpc.ai.parseVoiceExpense                      - WebSocket: /api/voice/live?token=...        │
└──────────────────────────────────────┬────────────────────────────────────────────┬─────────────────────────────┘
                                       │ HTTP / tRPC (Base64)                       │ WSS (16kHz PCM Int16)
                                       ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             BACKEND LAYER (Hono / Node.js)                                      │
│                                                                                                                 │
│   [api/ai-router.ts]                                              [api/server.ts & api/boot.ts]                 │
│   - parseVoiceExpense & speechToText Procedures                   - HTTP Upgrade Handler: /api/voice/live       │
│   - Plan Limits & Voice Quota Checks                              - Origin Header Verification (CSWSH Gate)     │
│   - runSTTPipeline()                                              - Auth Token & Session Validation             │
│     ├── Groq Whisper Large V3 API (multipart/form-data)           ▼                                             │
│     └── Google Gemini Audio STT (inlineData Base64)               [api/services/voice-call-service.ts]          │
│   - Multi-layer Classification & Persona Matching                 - Gemini Live WebSocket Client (BidiStream)   │
│   - Token & Cost Logging (voiceUsage table)                       - Voice Kernel: Tool Dispatch & Prefetch      │
│                                                                   - Voice Session State (Redis / Memory)        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Exhaustive Codebase Survey by Component

### 2.1 `src/components/expenses/ExpenseForm.tsx` (Voice Expense Recording)
- **Role**: Captures audio description of financial transactions (e.g. "دفعت 150 جنيه في كارفور خضار").
- **Key References**:
  - `probeAudioCodec()`: Lines 49–65 (evaluates `MediaRecorder.isTypeSupported` across WebM Opus, WebM, MP4, AAC).
  - State Declarations: Lines 235–243 (`mediaRecorderRef`, `mediaStreamRef`, `audioChunksRef`, `timerRef`, `durationRef`, `isCancelledRef`, `lastAudioToggleRef`).
  - `startRecording()`: Lines 661–827 (mic acquisition, MediaRecorder instantiation, chunk aggregation, timer loop).
  - `mediaRecorder.onstop`: Lines 703–776 (stream track teardown, empty audio validation, FileReader Base64 conversion, `parseVoiceMutation.mutate`).
  - `cancelRecording()`: Lines 634–659 (sets `isCancelledRef.current = true`, stops recorder, stops tracks, resets state).
  - `stopRecording()`: Lines 829–842 (clears timer, stops recorder).
  - `visibilitychange` Listener: Lines 845–857 (stops recording on `document.hidden`).
  - Unmount Cleanup: Lines 859–879 (stops recorder and all tracks).
  - `parseVoiceMutation`: Lines 380–427 (handles `auto_save`, `review`, `clarify`, and error states).
  - Dynamic Perceived Loading: Lines 493–513 (cycles Arabic loading messages every 400ms).

### 2.2 `src/hooks/useVoiceCall.ts` (Real-Time Bidirectional Voice Call)
- **Role**: Manages low-latency 16kHz PCM audio streaming to/from Gemini Live API.
- **Key References**:
  - AudioWorklet Definition (`WORKLET_CODE`): Lines 34–88 (downsamples native sample rate to 16,000 Hz, converts Float32 to Int16, delivers 2048-sample chunks via MessagePort).
  - Error Normalization (`normalizeVoiceError`): Lines 90–117 (maps `NotAllowedError`, `NotFoundError`, `NotReadableError`, and WebSocket server errors to colloquial Egyptian Arabic messages).
  - Hook State & Refs: Lines 119–150 (`status`, `errorMessage`, `isMuted`, `elapsedSeconds`, `aiText`, `voiceTrace`, `wsRef`, `audioCtxRef`, `micStreamRef`, `workletNodeRef`, `activeSourcesRef`, `inputAnalyserRef`, `outputAnalyserRef`, `outputGainRef`).
  - Audio Playback Queue (`playAudioChunk`): Lines 163–211 (converts 24kHz Int16 chunks to Float32, schedules `AudioBufferSourceNode` on `AudioContext.currentTime` with a 150ms jitter pre-roll).
  - `startCall()`: Lines 286–530 (requests mic at native rate, creates AudioContext & AnalyserNodes, initializes AudioWorklet from Blob URL, connects WebSocket to `/api/voice/live`, binds binary/JSON message handlers).
  - `endCall()` & Cleanup: Lines 214–283, 533–540 (disconnects audio nodes, terminates WebSocket, stops all MediaStream tracks, closes AudioContext, revokes Blob URL).

### 2.3 `src/components/ai/AIVoiceCall.tsx` (Voice Call UI & QA Harness)
- **Role**: Renders visual call states, voice selector (Olivia/Sarah/James), real-time animated waveform, subtitle cards, mute toggle, and QA tool trace telemetry.
- **Key References**:
  - Voice Persona Catalog: Lines 13–17 (`Aoede`, `Kore`, `Charon`).
  - State Integration: Lines 125–142 (consumes `useVoiceCall()` hook).
  - URL-driven QA Automation: Lines 151–237 (`voice_qa_tool` query param runner with 45s AbortController timeout).
  - Visual Layouts: Lines 251–335 (Idle/Selection), 337–352 (Connecting pulse), 354–442 (Connected state, duration counter, animated avatar, CC captions, call action buttons).
  - Telemetry Details (`VoiceTracePanel`): Lines 475–582 (inspects vector retrieval policy, cache hits, embedding API status, and tool results).

### 2.4 `api/ai-router.ts` & `api/services/voice-call-service.ts` (Backend Endpoints & Handlers)
- **Role**: STT transcription, classification pipeline, live WebSocket audio gateway, and rate limiting.
- **Key References**:
  - `api/ai-router.ts:parseVoiceExpense`: Lines 1610–1800 (validates payload size <= 13.3MB, checks plan duration limit, executes `runSTTPipeline` concurrently with profile loading, resolves multi-layer category classification, tracks `voiceUsage`).
  - `api/ai-router.ts:speechToText`: Lines 1345–1575 (standalone STT procedure with multi-key and multi-model fallback: primary -> fallback -> key2 -> gemini-2.0-flash).
  - `api/ai-router.ts:runSTTPipeline`: Lines 176–253 (dispatches to Groq Whisper Large V3 or Gemini GenerativeModel with tailored Egyptian dialect vocabulary prompt).
  - `api/server.ts` & `api/boot.ts`: Lines 41–48 / 548–555 (HTTP upgrade hook for `/api/voice/live`).
  - `api/services/voice-call-service.ts`: Lines 188–798 (`handleVoiceCallWebSocket`, authentication, plan duration/quota limits, Gemini Live WebSocket client handshake, bidirectional PCM piping, tool dispatch via `executeVoiceTool`, conversation memory archiving via `persistVoiceCallArchive`, cost logging).

---

## 3. Discovered Edge-Case Bugs & Vulnerabilities

| ID | Component | Severity | Category | Description |
|:---|:---|:---|:---|:---|
| **VULN-VOICE-01** | `api/server.ts:41-48`<br>`api/boot.ts:548-555` | **HIGH** | Security / CSWSH | **Unvalidated Origin on WebSocket Upgrade (`/api/voice/live`)**<br>The HTTP upgrade listener performs no `Origin` header validation. Browsers send ambient cookies (`google_session`) cross-origin, enabling malicious 3rd-party websites to open unauthorized live voice sessions. |
| **BUG-VOICE-02** | `ExpenseForm.tsx:683-695` | **MEDIUM** | State Race Condition | **Async `getUserMedia` Race on Rapid Cancel/Start**<br>`startRecording` sets `isCancelledRef.current = false` before `await getUserMedia()`. If the user cancels while the permission prompt is open, `cancelRecording()` sets `isCancelled = true`, but `startRecording()` does NOT check `isCancelled` after `await` resolves, causing a phantom recording to start in the background. |
| **BUG-VOICE-03** | `ExpenseForm.tsx:625-635` | **MEDIUM** | UX / State Lock | **Debounce Lockout on Cancel/Stop Actions**<br>`cancelRecording()` and `stopRecording()` enforce `if (isDebounced()) return;`. If a user clicks mic and immediately clicks cancel or stop (e.g. within 400ms), the cancel/stop action is silently dropped, trapping the user in an unwanted recording state. |
| **BUG-VOICE-04** | `ExpenseForm.tsx:740-776`<br>`parseVoiceMutation` | **MEDIUM** | Lifecycle / Hanging Spinner | **Unbounded Async Upload & Missing Mutation Timeout**<br>If the network drops or the proxy stalls during `parseVoiceMutation.mutate()`, `isProcessingVoice` remains `true` indefinitely with no timeout abort controller. The user is locked in an infinite loading spinner. |
| **BUG-VOICE-05** | `useVoiceCall.ts:565-566` | **LOW** | React Reactivity | **Unreactive AnalyserNode Refs in Hook Return**<br>`inputAnalyserRef.current` and `outputAnalyserRef.current` are created asynchronously inside `startCall()`. Because ref mutations do not trigger React re-renders, visualizer components receive `null` and never bind waveform rendering without external state changes. |
| **BUG-VOICE-06** | `useVoiceCall.ts` (General) | **MEDIUM** | PWA / Power State | **Missing `visibilitychange` & Backgrounding Handling in Voice Call**<br>`useVoiceCall.ts` has no listener for `visibilitychange` or `pagehide`. When a user locks their screen or switches tabs, mobile browsers (especially iOS Safari) suspend the `AudioContext`, while the WebSocket remains connected, wasting monthly minutes and AI tokens. |
| **BUG-VOICE-07** | `api/ai-router.ts:203` | **LOW** | Codec Compatibility | **Hardcoded `.webm` Extension in Groq FormData for MP4 Blobs**<br>Groq Whisper multipart upload hardcodes filename `"audio.webm"`. When iOS Safari sends an `audio/mp4` container blob, the `.webm` filename conflicts with the MP4 container format, risking codec parsing rejection on strict OpenAI-compatible gateways. |
| **BUG-VOICE-08** | `ExpenseForm.tsx` & `useVoiceCall.ts` | **LOW** | Hardware Lifecycle | **Missing MediaStream Track `ended` / `mute` Event Listeners**<br>If a user unplugs their headset, receives an incoming cellular phone call, or revokes mic permission via OS settings during recording, the track terminates without firing an error in `MediaRecorder` or `AudioWorklet`, causing silent recording stalls. |

---

## 4. In-Depth Edge-Case Analysis & Trace Evidence

### 4.1 Zero-Length Audio & Rapid Toggles
- **Observation**: In `ExpenseForm.tsx:720-728`:
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
  ```
- **Analysis**: If `durationRef.current === 0` (e.g. stop pressed within <1s), the recording correctly aborts. However, `isDebounced(400)` in `stopRecording()` (line 830) prevents the user from clicking stop within 400ms of clicking start, forcing the duration to exceed 0. Conversely, if `MediaRecorder` fails to emit `ondataavailable` before `onstop`, `audioChunksRef.current` is empty. The reset to `"idle"` is clean, but the UI feedback does not explain device warmup delays.

### 4.2 Microphone Permission Denial, Revocation, and Prompt Dismissal
- **Observation**: In `ExpenseForm.tsx:795-826`:
  ```ts
  } catch (err: unknown) {
    const name = ...;
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || ...) {
      toast.error("تم رفض إذن الميكروفون. يرجى تفعيل الصلاحية من إعدادات المتصفح للتسجيل الصوتي.", { duration: 6000 });
    }
  ```
- **Analysis**:
  - While initial denial is caught and translated to Arabic, the state machine has no intermediate `"requesting_permission"` state. During the 1–5 seconds while the browser modal is visible, the UI remains in `"idle"` with an active mic button, allowing the user to repeatedly click and trigger overlapping `getUserMedia` requests.
  - If microphone permission is revoked mid-call or hardware is disconnected, neither `MediaStreamTrack.onended` nor `MediaStreamTrack.onmute` is bound. The recording remains visually active until timeout.

### 4.3 Codec Compatibility Across iOS Safari, Android Chrome, and Capacitor
- **Observation**:
  - `ExpenseForm.tsx:53-64`:
    ```ts
    const hierarchy = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
    for (const mime of hierarchy) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    ```
  - `api/ai-router.ts:200-204`:
    ```ts
    const audioBuffer = Buffer.from(base64Audio, "base64");
    const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    ```
- **Analysis**:
  - On iOS Safari / Capacitor iOS, `audio/mp4` is selected by `probeAudioCodec()`.
  - When transmitted to `api/ai-router.ts`, Gemini STT handles `audio/mp4` seamlessly via `inlineData`. However, Groq Whisper receives a FormData entry named `"audio.webm"` containing MP4 binary data. To guarantee compatibility, the filename extension must match the MIME container (`audio/mp4` -> `audio.mp4`, `audio/aac` -> `audio.m4a`, `audio/webm` -> `audio.webm`, `audio/wav` -> `audio.wav`).

### 4.4 Backgrounding, Tab Switching, Screen Lock, and App Suspension
- **Observation**:
  - `ExpenseForm.tsx:845-857` attaches a `visibilitychange` listener that triggers `stopRecording()`.
  - `useVoiceCall.ts` has **NO** `visibilitychange` or `pagehide` listener.
- **Analysis**:
  - In `useVoiceCall.ts`, when a user switches tabs or locks their device, WebKit/Blink suspends the `AudioContext` to conserve battery.
  - The WebSocket connection remains active. The backend AI continues processing and streaming audio data that cannot be rendered.
  - When the user returns to the tab, the `AudioContext` resumes, but `nextPlayTimeRef.current` is out of sync with `audioCtx.currentTime`, resulting in a burst of stale audio chunks playing simultaneously.

### 4.5 WebSocket CSWSH & Handshake Security
- **Observation**: In `api/server.ts:41-48` and `api/boot.ts:548-555`:
  ```ts
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", "http://localhost");
    if (url.pathname.startsWith("/api/voice/live")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
  ```
- **Analysis**:
  - The HTTP upgrade event does NOT inspect `request.headers.origin`.
  - An attacker hosting `https://malicious-site.com` can run `new WebSocket("wss://smartspend.eg/api/voice/live")`. The browser automatically includes the `google_session` cookie. The backend `authenticateUser()` validates the cookie and authorizes the attacker to execute voice tools (querying bank balances, creating expenses, searching memories) on behalf of the victim.
  - **Remediation**: Implement strict `validateWebSocketOrigin(request)` comparing `Origin` against allowed hosts (`localhost`, configured domain, ngrok tunnel) before calling `wss.handleUpgrade`.

---

## 5. Recommended State-Machine Refactoring Plans

### 5.1 Formal State Machine: Expense Voice Recording (`ExpenseForm.tsx`)

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                                                             │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │      IDLE       │◄───────────────────────────────────────────────────┤
        └────────┬────────┘                                                    │
                 │ [click_mic: online && quota_ok]                             │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │ REQUESTING_MIC  ├─────────► [permission_denied / error] ─────────────┤
        └────────┬────────┘                                                    │
                 │ [permission_granted && !cancelled]                          │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │    RECORDING    ├─────────► [click_cancel] (immediate, no debounce) ──┤
        └────────┬────────┘                                                    │
                 │ [click_stop / max_duration_reached / visibility_hidden]     │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │    STOPPING     │                                                    │
        └────────┬────────┘                                                    │
                 │ [ondataavailable_flushed && onstop_fired]                   │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │   CONVERTING    ├─────────► [zero_bytes / read_error / 5s_timeout] ──┤
        └────────┬────────┘                                                    │
                 │ [valid_base64_ready]                                        │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │   PROCESSING    ├─────────► [server_error / 30s_timeout] ────────────┘
        └────────┬────────┘
                 │ [mutation_success]
                 ▼
        ┌─────────────────┐
        │ PARSED_DECISION │ ──► (auto_save -> SAVED | review -> REVIEW | clarify -> CLARIFY)
        └─────────────────┘
```

#### State Machine Invariants:
1. **No debounce on Cancel**: Cancel is an abortive safety valve and MUST execute immediately without a 400ms cooldown.
2. **Post-`getUserMedia` Cancellation Check**: After `navigator.mediaDevices.getUserMedia` resolves, verify `if (activeSessionId !== currentSessionId || isCancelled) { stream.getTracks().forEach(t => t.stop()); return; }`.
3. **Hardware Lifecycle Guard**: Bind `stream.getAudioTracks()[0].addEventListener("ended", () => handleUnexpectedStreamEnd())`.
4. **Client-Side Request Timeout**: Wrap `parseVoiceMutation` in a 30-second timeout guard to eliminate infinite spinner conditions.
5. **MIME-to-Extension Map**: Pass dynamically resolved extension (`.mp4`, `.webm`, `.wav`) to backend STT pipelines.

---

### 5.2 Formal State Machine: AI Live Voice Call (`useVoiceCall.ts`)

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                                                             │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │      IDLE       │◄───────────────────────────────────────────────────┤
        └────────┬────────┘                                                    │
                 │ [start_call(voice)]                                         │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │ REQUESTING_MIC  ├─────────► [permission_denied / error] ─────────────┤
        └────────┬────────┘                                                    │
                 │ [mic_stream_active]                                         │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │ CONNECTING_WS   ├─────────► [ws_error / 5s_handshake_timeout] ───────┤
        └────────┬────────┘                                                    │
                 │ [ws_open && ready_received]                                 │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │    CONNECTED    │◄───┐                                               │
        │   (LISTENING)   ├──┐ │                                               │
        └────────┬────────┘  │ │                                               │
                 │           │ │ [ai_turn_complete]                            │
                 │ [ai_pcm]  │ │                                               │
                 ▼           │ │                                               │
        ┌─────────────────┐  │ │                                               │
        │    CONNECTED    ├──┘ │                                               │
        │  (AI_SPEAKING)  │    │                                               │
        └────────┬────────┘    │                                               │
                 │             │                                               │
                 │ [user_speech_detected (interrupted)]                        │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │   INTERRUPTED   ├────┘                                               │
        │ (FLUSH_BUFFERS) │                                                    │
        └────────┬────────┘                                                    │
                 │ [end_call / quota_limit_reached / ws_closed / tab_hidden]   │
                 ▼                                                             │
        ┌─────────────────┐                                                    │
        │    TEARDOWN     ├────────────────────────────────────────────────────┘
        │ (CLOSE_ALL_RES) │
        └─────────────────┘
```

#### State Machine Invariants:
1. **Active Call Generation Index**: `activeCallIdRef.current` monotonically increments on every `startCall`. All async steps check `if (callId !== activeCallIdRef.current) abort()`.
2. **Reactive Visualizer State**: Expose `analyserNode` via React state (`const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null)`) so consumer components automatically re-render and attach waveform canvases.
3. **PWA Visibility Synchronization**: On `visibilitychange` (`document.hidden`), automatically pause/end call or send mute control message to prevent invisible background quota consumption.
4. **Jitter Buffer Drift Compensation**: If `nextPlayTimeRef.current - audioCtx.currentTime > 0.6` (more than 600ms latency drift), reset playback cursor to `audioCtx.currentTime + 0.1` to prevent latency accumulation.
5. **Strict Origin Gate**: Backend validates `Origin` against allowed hostnames before WebSocket upgrade.

---

## 6. Implementation Action Plan for Engineering Team

| Step | Action Item | Target File(s) | Expected Outcome |
|:---|:---|:---|:---|
| **1** | **Secure WebSocket Upgrade Origin** | `api/server.ts`<br>`api/boot.ts` | Rejects cross-origin WebSocket handshakes (`403 Forbidden`) preventing CSWSH attacks. |
| **2** | **Fix Async Mic Cancellation & Debounce in ExpenseForm** | `src/components/expenses/ExpenseForm.tsx` | Removes debounce on cancel; checks cancellation after `getUserMedia` resolves; prevents phantom recordings. |
| **3** | **Add Track Lifecycle & PWA Visibility Handlers** | `src/components/expenses/ExpenseForm.tsx`<br>`src/hooks/useVoiceCall.ts` | Safely tears down audio tracks on `ended`/`mute`/`visibilitychange` without hanging UI. |
| **4** | **Dynamic STT Audio Filename by MIME Type** | `api/ai-router.ts` | Formats Groq Whisper multipart upload with correct extension (`.mp4`, `.webm`, `.wav`). |
| **5** | **Reactive AnalyserNode State in useVoiceCall** | `src/hooks/useVoiceCall.ts` | Allows visualizer components to bind immediately upon connection without ref polling. |
| **6** | **Timeout Safety Guards on Processing & AI Calls** | `src/components/expenses/ExpenseForm.tsx`<br>`api/ai-router.ts` | 30s abort controllers eliminate stuck loading spinners and unhandled hung requests. |
| **7** | **Add Automated Audio State Machine Unit Tests** | `src/hooks/useVoiceCall.test.ts`<br>`api/voice-call-service.test.ts` | Verifies rapid toggles, permission rejection, and lifecycle teardown. |

---

## 7. Verification & Testing Matrix

```bash
# 1. Type-check monorepo contracts and hooks
npm run check

# 2. Run unit and integration tests across voice and AI modules
npm run test -- api/services/voice-kernel/ api/ai-router.voice-qa.test.ts api/services/voice-call-service.test.ts

# 3. Verify CSWSH protection via cURL or WebSocket test script
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Origin: https://evil-attacker.com" http://localhost:3000/api/voice/live
# Expected: 403 Forbidden or socket rejection before upgrade

# 4. End-to-end voice QA verification endpoint
# Access: http://localhost:3000/ai-center?voice_qa_tool=finance_query&voice_qa_period=today
```
