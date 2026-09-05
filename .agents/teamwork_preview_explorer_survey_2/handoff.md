# Handoff Report — AI Streaming & Chatbot Interaction Subsystem

**Agent**: Explorer 2 (AI Streaming & Agent Interaction Specialist)  
**Date**: 2026-08-30  
**Status**: Complete (Hard Handoff)

---

## 1. Observation

1. **AbortController Lifecycle & Race Conditions**:
   - `src/components/ai/AIChatbot.tsx:615`: `const abortControllerRef = useRef<AbortController | null>(null);`
   - `src/components/ai/AIChatbot.tsx:662-669`: Unmount cleanup calls `abortControllerRef.current.abort("unmount")`.
   - `src/components/ai/AIChatbot.tsx:731-739`: Stop button calls `abortControllerRef.current.abort("user_stop")` and sets `setIsTyping(false)`.
   - `src/components/ai/AIChatbot.tsx:785-812`: When `sendMessage.mutateAsync` resolves, execution proceeds immediately to `setMessages((prev) => [...prev, aiMsg])` without checking `if (controller.signal.aborted) return;`.
2. **Rate Limit Exponential Backoff & Dynamic Cooldown**:
   - `api/middleware.ts:8-19`: Backend `errorFormatter` extracts `retryAfterSeconds` from `error.cause.retryAfterSeconds` into `shape.data.retryAfterSeconds`.
   - `api/middleware.ts:93-98, 115-120`: Sliding window rate limiters (100 req/min) attach `cause: { retryAfterSeconds }`.
   - `api/chat-router.ts:486-497`: Chat daily quota check calculates seconds until midnight and returns `TOO_MANY_REQUESTS` with `cause: { retryAfterSeconds, isDailyLimit: true }`.
   - `src/components/ai/AIChatbot.tsx:839`: Frontend hardcodes `setRateLimitCooldown(10)`, completely ignoring the server-supplied `retryAfterSeconds`.
3. **Network Stall, Timeout & Draft Recovery**:
   - `src/components/ai/AIChatbot.tsx:778-782`: Client 45s watchdog timer calls `controller.abort("timeout")`.
   - `src/components/ai/AIChatbot.tsx:842-846`: Catch block removes optimistic message bubble and restores draft via `setInput(messageText)` and `setLastFailedPrompt(messageText)`.
   - `src/components/ai/AIChatbot.tsx:1215-1233`: Retry banner with `RotateCcw` button appears above composer.
   - `api/lib/deepseek-client.ts:78-80`: Backend fetch call has 45s timeout guard with `AbortController`.
4. **Markdown & RTL Stream Rendering**:
   - `src/components/ai/AIChatbot.tsx:492-599`: `BidiMarkdownRenderer` with `dir="auto"`.
   - `src/components/ai/AIChatbot.tsx:280, 328-334`: Special regex `^[\d,.]+\s*(?:ج\.م|EGP|LE|\$|€|%)$` is wrapped in `<bdi className="font-semibold text-foreground px-0.5 inline-block">` preventing RTL numeral and currency flip.
   - `src/components/ai/AIChatbot.tsx:366-372`: Resilient unclosed code block parser handles incomplete markdown chunks gracefully.
   - `src/components/ai/AIChatbot.tsx:721-728`: `visualViewport` listener handles mobile virtual keyboard layout shifts.
5. **Action Runtime & Pending Action Cards**:
   - `src/components/ai/AIChatbot.tsx:1603-1670`: `StructuredArtifactRenderer` for `action_confirmation` artifact with confirming state spinner.
   - `api/services/action-runtime/index.ts:268-286`: Atomic conditional DB update `WHERE id = actionId AND status = 'pending_confirmation'` provides CAS concurrency control against double executions.
   - `src/components/ai/AIChatbot.tsx:608`: `actionStatuses` is stored only in local React state, causing historical action cards on reloaded conversations to show active buttons.

---

## 2. Logic Chain

1. **Step 1 (Abort Signal Propagation)**: Observation 1 shows that `abortControllerRef` is properly created and aborted on unmount, stop generation, new prompt, or conversation switch. However, because `sendMessage.mutateAsync` does not reject when the client controller aborts, execution resumes at line 791 upon completion. Without a guard checking `controller.signal.aborted`, the resolved AI message is inserted into state and invalidates queries even after the user cancelled the generation.
2. **Step 2 (Rate Limit Desynchronization)**: Observation 2 shows that the backend middleware and chat router accurately calculate exact seconds until rate limit or daily quota reset (`retryAfterSeconds`), but the frontend hardcodes `setRateLimitCooldown(10)`. When a user encounters a rate limit longer than 10 seconds, the client countdown reaches 0 prematurely, prompting the user to send another message and causing an immediate second failure.
3. **Step 3 (Network Stall Resilience)**: Observation 3 shows that error and timeout recovery reliably protects against data loss by restoring user drafts to the composer and displaying a single-tap retry banner.
4. **Step 4 (RTL & Number Rendering Stability)**: Observation 4 confirms that BiDi rendering correctly isolates Egyptian Pound numbers and currencies with `<bdi>` tags and prevents markdown parser crashes on partial code blocks.
5. **Step 5 (Action Concurrency & State Hydration)**: Observation 5 proves that backend execution is safe from race conditions and double-executions via atomic CAS updates, but frontend card buttons do not reflect historical execution statuses across page reloads because `actionStatuses` is not hydrated from the conversation history.

---

## 3. Caveats

- Voice call WebSockets (`/api/voice/live` and `useVoiceCall.ts`) use binary PCM streams via `AudioWorklet` rather than tRPC/SSE text streaming.
- Chat streaming in the current release is structured request/response over tRPC HTTP rather than chunk-by-chunk SSE streaming.
- No other caveats.

---

## 4. Conclusion

The SmartSpend AI interaction architecture is robust, deterministic, and securely protected against duplicate action executions and Arabic RTL layout glitches. To reach production-grade resilience:
1. Insert a post-await `if (controller.signal.aborted) return;` guard in `AIChatbot.tsx:790` to eliminate abort race conditions.
2. Extract `error?.data?.retryAfterSeconds` in `AIChatbot.tsx:839` to synchronize the rate limit countdown timer with server reality.
3. Hydrate historical action confirmation statuses in `getConversation` to disable buttons on previously executed actions upon page reload.

---

## 5. Verification Method

1. **Static Analysis & Type Checking**:
   - Run `npm run check` across the monorepo to verify full type safety.
2. **Unit & Integration Testing**:
   - Run `npm run test` or `npx vitest run api/chat-router.phase0.test.ts api/services/action-runtime/index.test.ts` to verify action runtime and chat router behavior.
3. **Files to Inspect**:
   - `src/components/ai/AIChatbot.tsx` (lines 785–850, 835–845, 1603–1670).
   - `api/chat-router.ts` (lines 485–498, 1091–1136).
   - `api/services/action-runtime/index.ts` (lines 268–286).
