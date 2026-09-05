# Handoff Report — Voice & Audio Recording Subsystem Investigation

**Agent**: Explorer 1 (Voice & Audio Recording State Machine Specialist)  
**Working Directory**: `e:/smartspend_V1_fixed/.agents/teamwork_preview_explorer_survey_1/`  
**Recipient**: Parent Orchestrator (`cacd9dc6-f7a7-488d-bea7-a95c193ae218`)  
**Timestamp**: 2026-08-30T01:59:30+01:00  

---

## 1. Observation

1. **Zero-Length & Silent Audio Filtering**:
   - In `src/components/expenses/ExpenseForm.tsx:751-769`:
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
   - In `src/components/expenses/ExpenseForm.tsx:778-781`: checks `!base64Audio || base64Audio.trim().length === 0` before mutating.
   - In `api/ai-router.ts:1679-1681`: `if (!transcribedText || transcribedText.trim() === "") { throw new TRPCError({ code: "BAD_REQUEST", message: "لم نتمكن من سماع شيء. حاول مرة أخرى." }); }`.
   - In `src/hooks/useVoiceCall.ts:508-522`: computes RMS of PCM samples (`rms > 200` flags `userHasSpokenRef.current = true` for subtitle reset while continuous stream is sent to Gemini Live VAD).

2. **Permission Denial & Error Mapping**:
   - In `src/components/expenses/ExpenseForm.tsx:830-861`: handles `NotAllowedError`, `PermissionDeniedError`, `NotFoundError`, `NotReadableError`, and maps each to localized Arabic copy with 100ms reset back to `flowStage = "idle"`.
   - In `src/hooks/useVoiceCall.ts:90-117`: `normalizeVoiceError` maps device/permission errors to Arabic messages and transitions `status` to `"error"`.
   - In `src/components/ai/AIVoiceCall.tsx:139` & `276-280`: `isIdle` includes `"error"`, rendering the Arabic error and enabling the "ابدأ المكالمة" button for retry without reload.

3. **Backgrounding & Page Lifecycle**:
   - In `src/components/expenses/ExpenseForm.tsx:880-892`: `visibilitychange` listener terminates active recordings if `document.hidden` is true.
   - In `src/hooks/useVoiceCall.ts`: `visibilitychange` / `pagehide` is NOT registered. When a user switches tabs or minimizes the browser, the active WebSocket connection and `AudioWorklet` stream continue running in the background.

4. **Codec Probing & Container Alignment**:
   - In `src/components/expenses/ExpenseForm.tsx:49-65`: `probeAudioCodec()` probes `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/aac`.
   - In `api/ai-router.ts:200-204`: Groq Whisper transcription hardcodes the multipart filename to `"audio.webm"` (`formData.append("file", blob, "audio.webm")`) even when the incoming audio payload is `audio/mp4` or `audio/aac`.

5. **Rapid Toggle & Race Condition Prevention**:
   - In `src/components/expenses/ExpenseForm.tsx`: `isDebounced(400)` guards recording starts (line 626); `cancelRecording()` explicitly bypasses debounce (line 636); monotonic `activeAudioSessionIdRef.current` (line 689) and `isCancelledRef.current` (line 637) stop all media tracks immediately if the user cancels while permission dialog is pending (line 697); hardware `audioTrack.addEventListener("ended")` (line 712) safely halts recorder if device is unplugged.
   - In `src/hooks/useVoiceCall.ts`: monotonic `activeCallIdRef.current` (line 290) and `isCallActiveRef.current` (line 287) validate call validity after `getUserMedia`, after `audioWorklet.addModule`, and before WebSocket creation.

6. **Network Failure & Timeout Handling**:
   - In `src/components/expenses/ExpenseForm.tsx:782-790`: `parseVoiceMutation.mutate` has no client-side timeout or AbortController. Network stalls leave `isProcessingVoice = true` indefinitely.
   - In `api/server.ts:41-59` & `api/boot.ts:150-203`: WebSocket upgrade on `/api/voice/live` validates origin via `isAllowedWebSocketOrigin`, mitigating CSWSH.
   - In `api/services/voice-call-service.ts:398-409`: Server-side timers enforce monthly limits and broadcast 10-second warnings before connection teardown.

---

## 2. Logic Chain

1. **From Observation 1**: Single-shot voice recording in `ExpenseForm.tsx` thoroughly checks chunk length, byte size, duration, blob size, and Base64 content before calling the backend. Therefore, accidental taps (<1s) and silent recordings fail-fast on the client without burning API quotas.
2. **From Observation 2**: Both `ExpenseForm.tsx` and `useVoiceCall.ts` parse standard Web API error types (`NotAllowedError`, `NotFoundError`, `NotReadableError`) and map them to informative, non-technical Arabic toasts/banners while releasing all hardware tracks and resetting state machines to idle/retryable states.
3. **From Observation 3**: `ExpenseForm.tsx` handles `visibilitychange` cleanly, but `useVoiceCall.ts` omits this lifecycle listener. Therefore, backgrounding the browser during a live consultation causes unnecessary background streaming, battery drain, and quota consumption.
4. **From Observation 4**: In `api/ai-router.ts:203`, hardcoding `"audio.webm"` for Groq Whisper causes a mismatch when iOS Safari clients send `audio/mp4` blobs, which can trigger demuxing errors on Groq's transcription endpoints.
5. **From Observation 5**: Monotonic session/call IDs and cancellation flags in both recording hooks ensure that rapid start/cancel actions cleanly stop media streams, preventing runaway audio recording indicators.
6. **From Observation 6**: While the backend WebSocket and server endpoints have robust timeout and origin controls, `parseVoiceMutation` in `ExpenseForm.tsx` lacks a client-side timeout, creating an infinite spinner vulnerability if network connections stall.

---

## 3. Caveats

- **Native Capacitor Plugins**: This survey evaluated Web, PWA, and standard Web Audio API / MediaRecorder implementations. If custom native Capacitor audio plugins (e.g. `@capacitor-community/media-recorder`) are introduced for iOS/Android native bridges in the future, native OS backgrounding events (`App.addListener('appStateChange')`) will require separate binding.
- No other caveats.

---

## 4. Conclusion

The voice and audio recording subsystem in SmartSpend AI is structurally sound and well-architected. Three specific remediation items should be implemented to achieve full fault tolerance:
1. **Add `visibilitychange` & `pagehide` listener in `src/hooks/useVoiceCall.ts`** to end active calls when the user switches tabs or minimizes the app.
2. **Dynamically set filename extension in `api/ai-router.ts:203`** based on `mimeType` (`recording.mp4`, `recording.webm`, `recording.wav`) for Groq Whisper uploads.
3. **Add a 30-second client-side timeout guard to `parseVoiceMutation` in `src/components/expenses/ExpenseForm.tsx`** to prevent infinite loading spinners on stalled networks.

---

## 5. Verification Method

1. **Vitest Unit & State Machine Test Suite**:
   Run the dedicated voice state machine suite:
   ```bash
   npm run test tests/voice-state-machine.test.ts
   ```
   *Expected Result*: All 22 tests pass (verifying transitions, cancellations, RMS calculation, CSWSH origins, and container alignment).

2. **Full Monorepo Type Check**:
   ```bash
   npm run check
   ```
   *Expected Result*: Zero TypeScript compiler errors across `api/`, `contracts/`, `db/`, `src/`, `tests/`.

3. **Inspection of Artifacts**:
   - `e:/smartspend_V1_fixed/.agents/teamwork_preview_explorer_survey_1/report.md` (Comprehensive audit matrix and blueprints)
   - `e:/smartspend_V1_fixed/.agents/teamwork_preview_explorer_survey_1/handoff.md` (Self-contained 5-component report)
