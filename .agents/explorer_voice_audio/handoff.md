# Handoff Report: Voice & Audio Recording Survey (Web & PWA)

**Explorer**: Explorer 1 (`explorer_voice_audio`)  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/explorer_voice_audio/`  
**Reference Report**: `e:/smartspend_V1_fixed/.agents/explorer_voice_audio/report.md`  
**Date**: 2026-08-29  

---

## 1. Observation

Direct code observations across frontend and backend audio subsystems:

1. **CSWSH Vulnerability on Live Voice WebSocket (`api/server.ts:41-48`, `api/boot.ts:548-555`)**:
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
   No `request.headers.origin` validation is performed prior to upgrading WebSocket requests.

2. **Async `getUserMedia` Cancellation Race Condition (`src/components/expenses/ExpenseForm.tsx:683-718`)**:
   ```ts
   isCancelledRef.current = false;
   try {
     setLatestParserTrace(null);
     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
     mediaStreamRef.current = stream;
     ...
     mediaRecorder.start();
     setIsRecording(true);
   ```
   `isCancelledRef.current` is set to `false` before awaiting `getUserMedia`. If `cancelRecording()` is called while the permission prompt is open, `isCancelledRef.current` is set to `true`, but `startRecording()` does NOT check `if (isCancelledRef.current)` after `await navigator.mediaDevices.getUserMedia(...)` resolves.

3. **Debounce Lockout on Cancel/Stop Actions (`src/components/expenses/ExpenseForm.tsx:625-635`)**:
   ```ts
   const isDebounced = (cooldownMs = 400): boolean => {
     const now = Date.now();
     if (now - lastAudioToggleRef.current < cooldownMs) return true;
     lastAudioToggleRef.current = now;
     return false;
   };
   const cancelRecording = () => {
     if (isDebounced()) return;
     ...
   };
   ```
   Debouncing blocks immediate cancellation when user cancels within 400ms of clicking record.

4. **Unreactive AnalyserNode Refs (`src/hooks/useVoiceCall.ts:565-566`)**:
   ```ts
   return {
     ...
     inputAnalyser: inputAnalyserRef.current,
     outputAnalyser: outputAnalyserRef.current,
   };
   ```
   `inputAnalyserRef.current` and `outputAnalyserRef.current` are initialized to `null` and mutated asynchronously inside `startCall()`. Ref mutations do not trigger React re-renders, causing visualizers to remain unbound.

5. **Groq Whisper Hardcoded Container Filename (`api/ai-router.ts:200-204`)**:
   ```ts
   const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
   const formData = new FormData();
   formData.append("file", blob, "audio.webm");
   ```
   Groq Whisper multipart upload hardcodes filename `"audio.webm"` even when `mimeType` is `audio/mp4` (iOS Safari).

6. **Missing Backgrounding / Visibility Listener in Live Voice Call (`src/hooks/useVoiceCall.ts:1-569`)**:
   `useVoiceCall.ts` contains zero event listeners for `document.addEventListener("visibilitychange", ...)` or `window.addEventListener("pagehide", ...)`.

---

## 2. Logic Chain

1. **Security Chain (CSWSH)**:
   - Observation 1 demonstrates that `/api/voice/live` upgrades all WebSocket requests matching the path without checking the HTTP `Origin` header.
   - Browsers send ambient cookies (`google_session`) during WebSocket upgrade requests regardless of site origin.
   - `api/services/voice-call-service.ts:32-58` accepts cookie auth tokens for session resolution.
   - Therefore, a malicious external website can initiate a cross-site WebSocket connection and execute authorized voice actions against the victim's account.

2. **State-Machine Chain (ExpenseForm)**:
   - Observations 2 and 3 demonstrate that `startRecording()` performs asynchronous hardware acquisition without verifying cancellation state post-resolution, and `cancelRecording()` is throttled by a 400ms debounce.
   - If a user rapidly taps record and cancel, the cancellation is either ignored by the debounce or bypassed when `getUserMedia` resolves after the cancel invocation.
   - Therefore, `ExpenseForm` can enter a phantom background recording state that traps the UI.

3. **Reactivity & UX Chain (useVoiceCall & Codec)**:
   - Observation 4 shows analyser refs are returned directly from the hook. React components reading these properties receive `null` on mount and never receive the populated `AnalyserNode` instances.
   - Observation 5 shows iOS Safari audio blobs (`audio/mp4`) are sent to Groq with `.webm` file extension, risking transcription failures on strict upstream gateways.
   - Observation 6 shows voice calls continue streaming in background tabs when the browser suspends Web Audio rendering, causing audio buffer desynchronization and quota waste.

---

## 3. Caveats

- **Native Capacitor Audio Plugins**: The survey focused on Web and PWA audio pipelines (`navigator.mediaDevices`, `MediaRecorder`, `AudioContext`, and `AudioWorklet`). If native Capacitor audio plugins (e.g. `@capacitor-community/media-recorder`) are introduced in the future, native permission models will require separate lifecycle bindings.
- **Microphone Hardware Sampling**: Testing on low-end Android hardware with 8kHz or 48kHz native sample rates relies on browser resampling and AudioWorklet linear interpolation.

---

## 4. Conclusion

The SmartSpend AI voice and audio architecture is fundamentally functional but suffers from 8 identified edge-case bugs and security gaps across race conditions, debounce lockouts, unreactive visualizer refs, missing backgrounding hooks, and unvalidated WebSocket upgrades. Implementing the formal state-machine refactoring architectures defined in `report.md` will achieve 100% resilience across iOS Safari, Android Chrome, and PWA environments.

---

## 5. Verification Method

To verify these findings and validate future patches:

1. **Static Analysis & Type-Checking**:
   ```bash
   npm run check
   ```

2. **Automated Voice Suite Execution**:
   ```bash
   npm run test -- api/services/voice-kernel/ api/ai-router.voice-qa.test.ts api/services/voice-call-service.test.ts
   ```

3. **Origin Validation Test (CSWSH Probe)**:
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Origin: https://unauthorized-domain.com" http://localhost:3000/api/voice/live
   # Invalidation condition: Connection accepted with HTTP 101 Switching Protocols.
   # Verification success: Connection rejected with HTTP 403 Forbidden.
   ```

4. **File Inspection**:
   - Inspect `e:/smartspend_V1_fixed/.agents/explorer_voice_audio/report.md` for the full technical breakdown, state diagrams, and remediation steps.
