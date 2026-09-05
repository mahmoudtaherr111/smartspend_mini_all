# 5-Component Handoff Report: AI Streaming & Agent Interaction Survey

**Agent**: Explorer 2 (`explorer_ai_streaming`)  
**Target File**: `e:/smartspend_V1_fixed/.agents/explorer_ai_streaming/handoff.md`  
**Full Investigation Report**: `e:/smartspend_V1_fixed/.agents/explorer_ai_streaming/report.md`  
**Date**: 2026-08-29  

---

## 1. Observation

Direct observations from codebase inspection across frontend (`src/`) and backend (`api/`):

1. **Frontend Chat State & Abort Lifecycle**:
   - `src/components/ai/AIChatbot.tsx` (Lines 615, 661–669, 730–740, 755–783):
     Uses `abortControllerRef.current` with triggers `unmount`, `user_stop`, `timeout`, `new_prompt`, `new_conversation`, `clear_conversation`, `switch_conversation`.
   - Client timeout is 45,000ms (`setTimeout(() => controller.abort("timeout"), 45_000)`).
   - Optimistic message added to state (`userMsg`), and popped if the request fails or times out.
   - Textarea auto-expands up to 128px (`composer.scrollHeight`).

2. **RTL & Markdown Token Engine**:
   - `src/components/ai/AIChatbot.tsx` (Lines 277–338, 340–490, 492–599):
     Custom React markdown parser (`parseMarkdownBlocks`, `renderInlineMarkdown`, `BidiMarkdownRenderer`).
     Employs `<bdi>` tag on regex-matched currency tokens (`ج.م`, `EGP`, `$`, `%`) to prevent number inversion in RTL mode.
     Pre-formatted code blocks enforce `dir="ltr"`. Tables wrap in horizontal scroll containers.

3. **Backend AI Procedures & Execution Gateway**:
   - `api/middleware.ts` (Lines 34–55, 79–94):
     `aiProcedure` uses in-memory `aiRateLimitMap` (100 req/min/user).
   - `api/chat-router.ts` (Lines 428–1027):
     `sendMessage` executes Plan-First AI Kernel (`runAIKernelActive`), resolving SQL aggregation fast paths for deterministic queries ($0.00, 0 tokens), and calling external LLM via `callChatCompletionAPI` when needed.
   - `api/lib/ai-gateway.ts` (Lines 350–570):
     Manages multi-provider routes, token anatomy decomposition, and asynchronous ledger logging (`aiTokenLedgers`). Server-side fetch has an internal 45,000ms timeout.
   - `api/boot.ts` (Lines 321–365):
     Mounts zero-polling SSE endpoint `/api/sse/otp` with client IP rate limiting and 5-minute maximum lifecycle.

4. **Live Audio Voice Streaming**:
   - `src/hooks/useVoiceCall.ts` (Lines 34–88, 120–300):
     Implements AudioWorklet (`PCMProcessor`) converting microphone float32 to 16kHz Int16 linear PCM in 2048-sample chunks, transmitting over WebSocket `/api/voice/live`.

---

## 2. Logic Chain

1. **Client/Server Cancellation Disconnect**:
   - *Observation*: Client invokes `controller.abort()`, severing client `fetch()`. Backend `api/chat-router.ts` does not receive or check `c.req.raw.signal`.
   - *Deduction*: When users click "Stop Generating" or timeout fires, backend LLM requests and database writes continue to completion, consuming unnecessary provider token costs and creating orphaned DB records.
2. **Timeout Race Condition**:
   - *Observation*: Client timeout is 45s (`AIChatbot.tsx:778`), backend provider timeout is 45s (`deepseek-client.ts:79`, `ai-gateway.ts:447`).
   - *Deduction*: Network latency adds roundtrip delay. If an upstream LLM completes at 44.8s, the client will timeout at 45.0s before receiving the response, causing false-positive timeouts.
3. **Tab Switch State Loss**:
   - *Observation*: `AICenter.tsx:128` unmounts `<AIChatbot />` upon tab change.
   - *Deduction*: If a user submits a prompt in a new conversation and switches tabs before the response resolves, local `conversationId` is lost, and remounting shows an empty new conversation.
4. **Rate Limit 429 Synchronization**:
   - *Observation*: Frontend hardcodes 10s cooldown timer (`setRateLimitCooldown(10)`), while backend rate window is 60s (`AI_RATE_LIMIT_WINDOW = 60 * 1000`).
   - *Deduction*: Users who get rate-limited will retry after 10s and immediately get blocked again until the 60s window resets.

---

## 3. Caveats

- **No Streaming Backend Endpoint for Chat**: Chat currently uses tRPC unary mutations (`sendMessage`) with optimistic typing indicators, rather than token-by-token SSE streaming. Token streaming architecture is proposed in `report.md` §6.
- **WebSocket Backend Infrastructure**: Live voice WebSocket server handling resides in the standalone server layer; client hook `useVoiceCall.ts` and tool execution QA paths were validated.
- **Production Redis Dependency**: Local development uses in-process fallback maps; distributed multi-replica deployments rely on Redis for cross-pod rate limiting and socket session stickiness.

---

## 4. Conclusion

The SmartSpend AI conversational and voice platform features exceptional architectural foundations, specifically:
- Zero-cost deterministic SQL aggregation fast paths for spending inquiries.
- Two-phase idempotent action drafting (`aiPendingActions` + `idempotencyKey`).
- Bidi-isolated RTL Markdown rendering engine.
- Resilient client-side abort and error handling.

Remediating the 10 identified edge cases (detailed in `report.md` §4) — primarily server signal propagation, timeout calibration (32s server / 45s client), dynamic `Retry-After` rate-limit backoff, and tab unmount state preservation — will elevate the platform to tier-1 production resilience.

---

## 5. Verification Method

To independently verify all findings and test suites:

1. **TypeScript Type Safety**:
   ```bash
   npm run check
   ```
2. **Chat Router & AI Kernel Unit & Integration Tests**:
   ```bash
   npx vitest run api/chat-router.phase0.test.ts api/chat-router.phase1.test.ts api/chat-router.phase4.test.ts api/chat-router.phase6.test.ts api/chat-router.phase9.test.ts
   ```
3. **AI Procedures & Limits Tests**:
   ```bash
   npx vitest run api/ai-router.test.ts api/ai-router.voice-qa.test.ts api/ai-router.monthly-report-guard.test.ts
   ```
4. **Inspect Key Source Files**:
   - Frontend Chat: `src/components/ai/AIChatbot.tsx`
   - AI Center Tab Shell: `src/pages/AICenter.tsx`
   - Chat Router: `api/chat-router.ts`
   - AI Kernel: `api/services/ai-kernel/index.ts`
   - AI Gateway: `api/lib/ai-gateway.ts`
   - Voice Hook: `src/hooks/useVoiceCall.ts`
