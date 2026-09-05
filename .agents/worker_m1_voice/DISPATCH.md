## 2026-08-30T01:12:02Z

You are Worker 1: Voice & Audio Recording State Machine Specialist.
Working Directory: e:/smartspend_V1_fixed/.agents/worker_m1_voice/
Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (READ THIS FIRST).
Master Plan: e:/smartspend_V1_fixed/.agents/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- `src/hooks/useVoiceCall.ts`
- `api/ai-router.ts` (specifically Whisper upload MIME alignment around lines 200-240)

Assigned Tasks:
1. In `src/hooks/useVoiceCall.ts`: Add `visibilitychange` and `pagehide` event listeners that cleanly terminate active WebSockets, close AudioContext, stop MediaStream tracks, and reset UI state when the user backgrounds the tab or navigates away.
2. In `api/ai-router.ts`: Dynamically derive the filename/extension for Groq Whisper transcription from the incoming `audioFile` MIME type (e.g. `audio/mp4` -> `"audio.mp4"`, `audio/webm` -> `"audio.webm"`, `audio/ogg` -> `"audio.ogg"`) so that iOS Safari recordings are properly parsed without demuxer errors.
3. Verify changes with `npm run check` and run relevant vitest tests (`npm run test`).
4. Write your completion report in `e:/smartspend_V1_fixed/.agents/worker_m1_voice/handoff.md` and send a message when done.
