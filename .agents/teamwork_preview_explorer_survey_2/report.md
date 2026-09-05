# SmartSpend AI — AI Streaming & Agent Interaction Subsystem Investigation Report

**Author**: Explorer 2 (AI Streaming & Agent Interaction Specialist)  
**Date**: 2026-08-30  
**Scope**: Full-stack analysis of AI chatbot streaming, user interaction lifecycle, error resilience, bidirectional rendering, and action runtime in SmartSpend AI.

---

## 1. Executive Summary

This investigation analyzed the AI streaming, chatbot orchestration, and agent interaction subsystems in SmartSpend AI across frontend client components (`src/components/ai/AIChatbot.tsx`, `src/pages/AICenter.tsx`, `src/providers/trpc.ts`), backend tRPC routers (`api/chat-router.ts`, `api/ai-router.ts`, `api/middleware.ts`), and core services (`api/services/ai-kernel/`, `api/services/action-runtime/`).

The system architecture implements a deterministic **Plan-First AI Kernel** with structured artifact generation (charts, tables, metric cards, action proposals) and server-side atomic action execution. While the core functionality is robust and feature-rich, our investigation revealed critical resilience gaps in AbortController signal handling, hardcoded rate limit backoffs, and post-refresh historical action card states.

---

## 2. Investigation Matrix & Detailed Findings

### Pillar 1: AbortController Lifecycle & Cleanup

#### Observations & Implementation Analysis
- **Lifecycle Hook Management (`src/components/ai/AIChatbot.tsx:615, 662-669`)**:
  - Chatbot maintains an `abortControllerRef = useRef<AbortController | null>(null)`.
  - On component unmount, the effect cleanup invokes `abortControllerRef.current.abort("unmount")` to prevent dangling references and memory leaks.
- **User Stop Button (`src/components/ai/AIChatbot.tsx:731-739, 1253-1262`)**:
  - While generating (`isTyping === true`), the input submit button morphs into a red Stop button (`Square` icon).
  - Clicking invokes `handleStopGeneration()`, which executes `abortControllerRef.current.abort("user_stop")` and resets `isTyping = false`.
- **Navigation & Conversation Switching (`src/components/ai/AIChatbot.tsx:750-756, 926-959`)**:
  - Submitting a new message aborts previous in-flight requests with reason `"new_prompt"`.
  - Switching conversation tabs or creating a new conversation aborts in-flight generation with reasons `"switch_conversation"` and `"new_conversation"`.
- **Watchdog Timer (`src/components/ai/AIChatbot.tsx:778-782, 847-850`)**:
  - A client-side 45-second `setTimeout` aborts the controller with `"timeout"`. Timers are cleared in `finally` and `catch` blocks.

#### Critical Vulnerabilities & Gaps Found
1. **Post-Await Signal Race Condition (`src/components/ai/AIChatbot.tsx:785-812`)**:
   - `sendMessage.mutateAsync(...)` is called asynchronously. When the user stops generation or unmounts the component, `controller.abort()` is called.
   - However, after `await sendMessage.mutateAsync(...)` resolves, lines 794–812 continue execution **without** checking `if (controller.signal.aborted) return;`.
   - **Impact**: Even if a user clicks Stop or switches conversations, the delayed assistant response bubble is appended to the message list and conversation queries are invalidated, violating user intent and potentially causing memory/state inconsistencies.
2. **Missing Network-Level Abort Propagation**:
   - The tRPC client mutation call does not bind the `AbortSignal` to the HTTP link. The backend continues executing the LLM and database queries even after the client cancels.

---

### Pillar 2: Rate Limit Exponential Backoff & Quota Error Handling

#### Observations & Implementation Analysis
- **Backend Error Formatting & Rate Limits (`api/middleware.ts:6-25, 93-98, 115-120`)**:
  - `tRPC` `errorFormatter` explicitly attaches `retryAfterSeconds` from `error.cause` into `shape.data.retryAfterSeconds`.
  - In-memory rate limiters (100 req/min) compute the exact time remaining until the rate limit window resets.
- **Daily Quota Management (`api/chat-router.ts:486-497`)**:
  - Calculates the remaining time until midnight (`businessDayRange()`) and returns `TOO_MANY_REQUESTS` with `cause: { retryAfterSeconds, isDailyLimit: true }` and Arabic copy: `"وصلت الحد اليومي (${dailyLimit} رسالة). جرب بكره أو ترقي خطتك! 💎"`.
- **Frontend Error Mapping (`src/components/ai/AIChatbot.tsx:135-234`)**:
  - `formatAiErrorMessage` handles HTTP 429, `TOO_MANY_REQUESTS`, 403 `FORBIDDEN` (monthly quota exhaustion), and 503 upstream server pressure with user-friendly Arabic text.
- **UI Countdown Timer (`src/components/ai/AIChatbot.tsx:609, 671-686, 1201-1213`)**:
  - Renders a floating banner with a spinning clock and dynamic countdown text when `rateLimitCooldown > 0`.

#### Critical Vulnerabilities & Gaps Found
1. **Hardcoded Cooldown Override (`src/components/ai/AIChatbot.tsx:839`)**:
   - When a 429 occurs, `AIChatbot.tsx` executes `setRateLimitCooldown(10)` (hardcoded to 10 seconds).
   - **Root Cause**: It fails to read `error?.data?.retryAfterSeconds` from the tRPC response.
   - **Impact**: If a user hits a 45-second sliding window limit or a daily limit, the timer counts down from 10 to 0, re-enables the send button, and immediately causes repeated 429 failures upon the user's next click.
2. **Missing Plan Upgrade CTA for Daily/Monthly Quota**:
   - Daily and monthly quota errors should present an immediate action button routing the user to `/pro` or `/ultra`, rather than a generic error toast.

---

### Pillar 3: Network Stall & Timeout Recovery

#### Observations & Implementation Analysis
- **Disconnect & Stall Detection (`src/components/ai/AIChatbot.tsx:156-178`)**:
  - Checks `navigator.onLine` and matches network drop strings (`"Failed to fetch"`, `"تعذر الاتصال بالخادم"`).
- **Draft Preservation & Retry System (`src/components/ai/AIChatbot.tsx:822-845, 1215-1233`)**:
  - When a request fails or times out, the optimistic message bubble is removed from the list, the prompt text is restored into `input` via `setInput(messageText)`, and `setLastFailedPrompt(messageText)` is populated.
  - A retry banner appears directly above the textarea with a `RotateCcw` button that re-submits the exact prompt with a single tap.
- **Backend External Call Timeouts (`api/lib/deepseek-client.ts:78-80`, `api/lib/ai-gateway.ts:446-448`)**:
  - External LLM provider calls wrap `fetch` with an `AbortController` and a 45-second timeout, throwing localized errors rather than hanging indefinitely.

#### Critical Vulnerabilities & Gaps Found
1. **Request/Response Nature vs Streaming SSE**:
   - The chatbot uses standard tRPC HTTP mutations rather than SSE/chunked streams. While this ensures atomic structured artifact delivery, long queries (e.g. 15–20s complex RAG) provide only a static typing dot animation rather than progressive token feedback.

---

### Pillar 4: Markdown & RTL Stream Rendering

#### Observations & Implementation Analysis
- **Bidirectional Wrapper (`src/components/ai/AIChatbot.tsx:492-599`)**:
  - `BidiMarkdownRenderer` sets `dir="auto"` on the container and renders structured AST blocks.
- **Inline Tokenizer & `<bdi>` Currency Isolation (`src/components/ai/AIChatbot.tsx:277-338`)**:
  - Tokenizes bold, italic, strikethrough, inline code, and financial amounts.
  - **Financial BiDi Isolation (`lines 328-334`)**: Currency amounts matching `^[\d,.]+\s*(?:ج\.م|EGP|LE|\$|€|%)$` are wrapped in `<bdi className="font-semibold text-foreground px-0.5 inline-block">`. This prevents the Unicode Bidirectional Algorithm from flipping negative signs or punctuation to the wrong side of Egyptian Pound values in Arabic paragraphs.
- **Block Parsing Resilience (`src/components/ai/AIChatbot.tsx:340-490`)**:
  - `parseMarkdownBlocks` parses headings, blockquotes, tables, lists, and code blocks.
  - **Unclosed Code Block Guard (`lines 366-372`)**: If a code block is not closed with trailing ` ``` `, the parser captures all lines up to the EOF and wraps them cleanly in a `<CodeBlock />` without throwing or corrupting text.
- **Viewport & Autoscroll Management (`src/components/ai/AIChatbot.tsx:641-653, 709-728`)**:
  - Smooth autoscroll on new messages or typing state change.
  - `visualViewport` resize listener dynamically scrolls the chat container when the mobile soft keyboard appears (iOS Safari / Android Chrome).
  - Floating scroll-to-bottom button appears if the user scrolls >100px away from the bottom.

---

### Pillar 5: Action Runtime & Pending Action Cards

#### Observations & Implementation Analysis
- **Action Proposal Artifact (`src/components/ai/AIChatbot.tsx:1603-1670`, `api/services/action-runtime/artifacts.ts`)**:
  - Renders interactive proposal cards (`action_confirmation`) with extracted entity slots (amount, category, date, wallet, goal target).
  - Action buttons: "تأكيد" (`Check`) and "إلغاء" (`X`).
- **Atomic Compare-and-Swap Execution (`api/services/action-runtime/index.ts:268-286`)**:
  - Double execution is strictly prevented at the database level:
    ```ts
    const [updateResult] = await db
      .update(aiPendingActions)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(
        and(
          eq(aiPendingActions.id, actionId),
          eq(aiPendingActions.status, "pending_confirmation")
        )
      );

    if (!updateResult || (updateResult as any).affectedRows === 0) {
      throw new Error("العملية دي اتنفذت أو اتلغت بالفعل من قبل.");
    }
    ```
- **Dual Confirmation Channels**:
  - Users can confirm via the interactive UI button (`handleConfirmAction`) or via natural Arabic chat text (`"موافق"`, `"تمام"`, `"أكد"`, `"إلغاء"` handled by `resolveTextActionReply` in `api/chat-router.ts:396-420`).
- **TTL Expiry & Audit Logging (`api/services/action-runtime/index.ts:58-65, 114-123`)**:
  - Pending actions expire after 30 minutes (`expiresAt()`). Every transition (`draft_created`, `confirmed`, `executed`, `cancelled`, `failed`) is logged immutably in `aiActionAuditLogs`.

#### Critical Vulnerabilities & Gaps Found
1. **Volatile Action State upon Page Reload / Conversation Switch (`src/components/ai/AIChatbot.tsx:608, 1142-1146`)**:
   - `actionStatuses` is stored in ephemeral React component state (`useState<Record<string, string>>({})`).
   - When a user refreshes the page or reloads a conversation via `handleLoadConversation`, `actionStatuses` is empty. The historical message's action confirmation card re-renders with enabled "تأكيد" and "إلغاء" buttons.
   - Clicking "تأكيد" on an already executed action sends a mutation that rejects with `"العملية دي اتنفذت أو اتلغت بالفعل من قبل."`. While the backend safely blocks duplicate execution, the UI displays an error toast for an action the user previously completed.

---

## 3. Remediation Recommendations

### 1. Fix Abort Signal Post-Await Check (`src/components/ai/AIChatbot.tsx`)
Add an immediate abortion guard after `sendMessage.mutateAsync`:
```tsx
const result = await sendMessage.mutateAsync({
  message: messageText,
  conversationId: targetConversationId,
  devQaBypassDailyLimit: options?.devQaBypassDailyLimit === true || undefined,
});

if (controller.signal.aborted) {
  return;
}
```

### 2. Connect Dynamic `retryAfterSeconds` to Rate Limit Cooldown (`src/components/ai/AIChatbot.tsx`)
Extract the server-provided `retryAfterSeconds` from tRPC error data:
```tsx
const retryAfter = Number(error?.data?.retryAfterSeconds || error?.shape?.data?.retryAfterSeconds);
if (formatted.isRateLimit) {
  setRateLimitCooldown(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10);
}
```

### 3. Hydrate Historical Action Status in `getConversation` (`api/chat-router.ts` & `AIChatbot.tsx`)
In `api/chat-router.ts:1126-1135`, join `aiPendingActions` or check action statuses when returning historical messages, and initialize `actionStatuses` in `AIChatbot.tsx` with already-executed or cancelled states.
