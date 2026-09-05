# BRIEFING — 2026-08-30T01:58:30+01:00

## Mission
Investigate audio and voice recording subsystem state machine, edge cases, error handling, lifecycle, codecs, and race conditions across frontend and backend.

## 🔒 My Identity
- Archetype: explorer
- Roles: Voice & Audio Recording State Machine Specialist
- Working directory: e:/smartspend_V1_fixed/.agents/teamwork_preview_explorer_survey_1
- Original parent: cacd9dc6-f7a7-488d-bea7-a95c193ae218
- Milestone: Voice & Audio Recording Subsystem Security and Reliability Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify project code directly
- Adhere to Teamwork protocol and AGENTS.md rules

## Current Parent
- Conversation ID: cacd9dc6-f7a7-488d-bea7-a95c193ae218
- Updated: 2026-08-30T01:58:30+01:00

## Investigation State
- **Explored paths**:
  - `src/components/expenses/ExpenseForm.tsx` (Single-shot MediaRecorder, codec probe, zero-length audio guard, session IDs, hardware events)
  - `src/hooks/useVoiceCall.ts` (AudioWorklet 16kHz PCM streaming, WebSockets, playback queue, error normalization)
  - `src/components/ai/AIVoiceCall.tsx` (Interactive UI state machine, voice selector, subtitle sync, Voice QA harness)
  - `api/ai-router.ts` (`parseVoiceExpense`, `speechToText`, `runSTTPipeline`, Groq Whisper & Gemini STT)
  - `api/services/voice-call-service.ts` (WebSocket Gemini Live session, duration limiters, audio schema handling, tool execution)
  - `api/boot.ts` & `api/server.ts` (WebSocket upgrade CSWSH origin filtering)
  - `tests/voice-state-machine.test.ts` (State machine verification & unit tests)
  - `api/services/voice-call-service.test.ts` & `api/ai-router.voice-qa.test.ts`
- **Key findings**:
  1. Robust zero-length / short audio guards in `ExpenseForm.tsx` preventing quota burn and server errors on quick taps (<1s or 0 bytes).
  2. Complete Arabic error mapping for `NotAllowedError`, `NotFoundError`, and `NotReadableError` with clean state reset.
  3. Gap: `useVoiceCall.ts` lacks `visibilitychange` / `pagehide` listener (active live calls remain connected when tabs switch or screen locks).
  4. Gap: Groq Whisper STT in `runSTTPipeline` (`api/ai-router.ts:203`) hardcodes `"audio.webm"` filename regardless of MP4/AAC/WAV container format.
  5. Robust race condition prevention with monotonic session/call IDs in both `ExpenseForm.tsx` and `useVoiceCall.ts`.
  6. Gap: `parseVoiceMutation` in `ExpenseForm.tsx` lacks explicit 30s timeout guard, creating potential infinite spinner under severe network drops.
  7. Strong CSWSH protection on `/api/voice/live` WebSocket upgrade via `isAllowedWebSocketOrigin`.
- **Unexplored areas**: None. Comprehensive survey across all 6 matrix dimensions complete.

## Key Decisions Made
- Fully documented all 6 investigation matrices with line numbers, code snippets, root causes, and remediation plans.
- Authored `report.md` and `handoff.md`.

## Artifact Index
- DISPATCH.md — Initial dispatch logging
- BRIEFING.md — Persistent context briefing
- progress.md — Liveness and progress tracker
- report.md — Comprehensive voice subsystem audit report
- handoff.md — 5-component self-contained handoff report
