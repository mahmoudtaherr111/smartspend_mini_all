# AI Streaming & Agent Interaction Codebase Survey & Edge-Case Discovery
**SmartSpend AI Platform (Web & PWA)**
**Author**: Explorer 2 (`explorer_ai_streaming`)
**Date**: 2026-08-29
**Integrity Mode**: Full-Stack Read-Only Investigation

---

## 1. Executive Summary & Architecture Topology

SmartSpend AI is an Arabic-first behavioral financial intelligence platform built for the Egyptian market (EGP, local e-wallets, Vodafone Cash, InstaPay, and Egyptian colloquial dialect processing). The AI interaction surface spans three core channels:
1. **Interactive Conversational Agent (AI Chatbot)** — `src/components/ai/AIChatbot.tsx`, backed by `api/chat-router.ts` and the Plan-First AI Kernel (`api/services/ai-kernel/`).
2. **Real-Time Live Voice Call** — `src/components/ai/AIVoiceCall.tsx` and `src/hooks/useVoiceCall.ts`, utilizing bidirectional PCM audio streaming over WebSockets (`/api/voice/live`) and AudioWorklet processors.
3. **Automated Monthly & Comparative Financial Insights** — `src/components/ai/AIMonthlyReport.tsx` and `src/components/insights/AIInsights.tsx`, backed by `api/ai-router.ts` with aggressive multi-layer caching.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SMARTSPEND AI PLATFORM TOPOLOGY                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                CLIENT TIER (React 18 / Vite 7 / PWA)                             │
   │                                                                                                  │
   │  ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────────────────┐  │
   │  │   AICenter.tsx       │   │   AIChatbot.tsx      │   │   AIVoiceCall.tsx & useVoiceCall.ts  │  │
   │  │   (Tab Routing &     │   │   (State Machine,    │   │   (AudioWorklet PCM 16kHz,           │  │
   │  │    Lazy Suspense)    │   │    Bidi Markdown)    │   │    WebSocket Live Audio Stream)      │  │
   │  └──────────┬───────────┘   └──────────┬───────────┘   └──────────────────┬───────────────────┘  │
   └─────────────┼──────────────────────────┼──────────────────────────────────┼──────────────────────┘
                 │                          │                                  │
                 │ HTTP (tRPC v11 batching) │ HTTP (Mutation/Query)            │ WS (Bidirectional PCM)
                 ▼                          ▼                                  ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                 BACKEND TIER (Hono v4 / tRPC v11)                                │
   │                                                                                                  │
   │  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
   │  │  api/middleware.ts (aiProcedure, proAiProcedure, IP Rate Limiter, In-Memory User Rate Map)  │  │
   │  └──────────────────────────────────────────────┬─────────────────────────────────────────────┘  │
   │                                                 │                                                │
   │  ┌──────────────────────────────────────────────▼─────────────────────────────────────────────┐  │
   │  │  api/chat-router.ts (sendMessage, confirmAction, cancelAction, listMemories, etc.)         │  │
   │  └──────────────────────┬─────────────────────────────────────────┬───────────────────────────┘  │
   │                         │                                         │                              │
   │  ┌──────────────────────▼───────────────────────────┐   ┌─────────▼───────────────────────────┐  │
   │  │  api/services/ai-kernel/ (Plan-First Runtime)   │   │  api/services/ai-memory/ (RAG)      │  │
   │  │  - agent-planner.ts (Intent & Data Need Budget)  │   │  - memory-retriever.ts (Hybrid      │  │
   │  │  - clarification-machine.ts (Slot Machine)       │   │    Lexical/Vector 768-dim Scoring)  │  │
   │  │  - context-packer.ts (Token Budget Packing)      │   │  - memory-writer.ts (Durable Facts) │  │
   │  │  - response-normalizer.ts (Artifacts & Actions)  │   └─────────────────────────────────────┘  │
   │  └──────────────────────┬───────────────────────────┘                                            │
   │                         │                                                                        │
   │  ┌──────────────────────▼─────────────────────────────────────────────────────────────────────┐  │
   │  │  api/lib/ai-gateway.ts (Universal Execution Gateway, Model Routing, aiTokenLedgers Ledger)  │  │
   │  └──────────────────────┬─────────────────────────────────────────┬───────────────────────────┘  │
   └─────────────────────────┼─────────────────────────────────────────┼──────────────────────────────┘
                             │                                         │
                             ▼                                         ▼
   ┌──────────────────────────────────────────────────┐      ┌────────────────────────────────────────┐
   │        DETERMINISTIC SQL FAST PATH ($0.00)       │      │      UPSTREAM GENERATIVE PROVIDERS     │
   │  - Direct Drizzle ORM Aggregation                │      │  - DeepSeek / Fireworks / Groq /       │
   │  - Exact MySQL SUM / COUNT / GROUP BY            │      │    Google Gemini 3.1 Pro & Flash-Lite  │
   │  - Zero LLM Token Cost (<15ms latency)           │      │  - OpenRouter / Custom Endpoints       │
   └──────────────────────────────────────────────────┘      └────────────────────────────────────────┘
```

---

## 2. Frontend Component Analysis

### 2.1 Tab Topology & Lifecycle (`src/pages/AICenter.tsx`)
- **File Location**: `src/pages/AICenter.tsx` (Lines 1–146)
- **Tab Switching**: Uses URL search parameters (`?ai_tab=chat|voice|report`) synchronized via `useSearchParams` (Line 60).
- **History Preservation**: When a tab is clicked (`selectTab`, Line 64), `setSearchParams` appends or updates the search param, allowing the native browser/PWA back gesture to return to previous tabs without losing history.
- **Lazy Loading & Suspense**:
  ```tsx
  const AIChatbot = lazy(() => import("@/components/ai/AIChatbot"));
  const AIVoiceCall = lazy(() => import("@/components/ai/AIVoiceCall"));
  const AIMonthlyReport = lazy(() => import("@/components/ai/AIMonthlyReport"));
  ```
  Rendered inside `<Suspense fallback={<TabSkeleton />}>` wrapped with Framer Motion `<AnimatePresence mode="wait">` (Lines 126–143).
- **Edge-Case / Vulnerability Discovered (Unmount State Loss)**:
  When switching tabs, `<Suspense>` completely unmounts the inactive component. If the user sent a message in `AIChatbot` and switched to `voice` before the AI response resolved:
  1. `AIChatbot` unmounts, triggering `abortControllerRef.current.abort("unmount")` (Line 665).
  2. If it was a new conversation, `conversationId` was `undefined` in local state.
  3. The backend created the conversation in `chatConversations`, but because the client aborted and unmounted, the frontend state forgot the conversation ID.
  4. Returning to the `chat` tab renders an empty new chat instead of restoring the in-flight conversation.

### 2.2 Conversational State Machine (`src/components/ai/AIChatbot.tsx`)
- **File Location**: `src/components/ai/AIChatbot.tsx` (1858 Lines)
- **State Properties**:
  - `messages`: Array of `Message` (`id`, `role`, `content`, `createdAt`, `artifacts`, `actions`, `structured`).
  - `conversationId`: Active database conversation ID (`number | undefined`).
  - `isTyping`: Boolean indicating pending backend generation.
  - `rateLimitCooldown`: Number countdown (seconds) during active 429 cooldowns.
  - `lastFailedPrompt`: Cached string of the last rejected prompt for instant retry.
  - `actionStatuses`: Record of async action draft execution (`confirming | confirmed | cancelling | cancelled | failed`).

#### Optimistic User Bubble & Lifecycle
In `handleSend` (Lines 742–853):
1. Immediately creates an optimistic bubble:
   ```ts
   const userMsg: Message = {
     id: `user-${Date.now()}`,
     role: "user",
     content: messageText,
     createdAt: new Date(),
   };
   setMessages((prev) => [...prev, userMsg]);
   setIsTyping(true);
   ```
2. Instantiates a dedicated `AbortController` and attaches it to `abortControllerRef.current` (Line 755).
3. Establishes a 45-second client-side timeout safeguard:
   ```ts
   const timeoutId = setTimeout(() => {
     if (abortControllerRef.current === controller) {
       controller.abort("timeout");
     }
   }, 45_000);
   ```
4. Invokes `trpc.chat.sendMessage.mutateAsync(...)`.
5. On success: replaces typing state with the full `AIResponse`, binds `conversationId`, invalidates `getConversations` and `getConversation` caches.
6. On error / abort:
   - If `reason === "user_stop"`: quietly stops typing, keeps user bubble.
   - If `reason === "timeout"`: displays Arabic toast `"استغرق الرد وقتاً أطول من المتوقع..."`, pops the optimistic bubble, restores draft input, and offers an instant retry button.
   - If `isRateLimit`: triggers 10s cooldown timer (`setRateLimitCooldown(10)`).
   - If network failure: restores draft input and notifies user.

### 2.3 Markdown & Bidirectional RTL Stream Rendering
- **File Location**: `src/components/ai/AIChatbot.tsx` (Lines 277–599)
- **Components**:
  - `BidiMarkdownRenderer` (Lines 492–599)
  - `parseMarkdownBlocks` (Lines 340–490)
  - `renderInlineMarkdown` (Lines 277–338)
  - `CodeBlock` (Lines 236–275)

#### Architectural Strengths:
1. **Zero XSS Risk**: Avoids `dangerouslySetInnerHTML`. Directly tokenizes text into native React JSX elements (`<p>`, `<h3>`, `<ol>`, `<code>`, `<bdi>`).
2. **Bidirectional Isolation (`<bdi>`)**:
   Currency values and mixed numbers are detected by regex (`tokenRegex`, Line 280):
   ```ts
   const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?\s*(?:ج\.م|EGP|LE|\$|€|%))/g;
   ```
   Rendered inside `<bdi className="font-semibold text-foreground px-0.5 inline-block">` (Line 330), completely preventing RTL number flipping (e.g. preventing `500- ج.م` from showing backwards).
3. **Table & Code Containment**: Tables are wrapped in `<div className="my-2 overflow-x-auto rounded-lg border border-border/60">` with responsive horizontal scrolling on narrow mobile viewports. Code blocks feature language labels and one-click copy buttons.

#### Discovered Rendering Edge Cases:
1. **Streaming Markdown Chunk Splitting**: When tokens arrive in fragments (e.g., `**`, backticks, or split Arabic Unicode characters), a naive tokenizer would fail to match unclosed markdown fences. `parseMarkdownBlocks` handles unclosed code fences at EOF (Line 366–377), but incomplete inline tokens like `**مرحبا` render raw asterisks until the closing delimiter arrives.
2. **Auto-Scroll Thrashing**: `scrollToBottom` is called on every state update (`[messages, isTyping]`). If token-level streaming were enabled without RAF (RequestAnimationFrame) debouncing, rapid micro-chunks would cause noticeable mobile layout jitter.

### 2.4 Mobile & PWA Keyboard Stability
- **Virtual Viewport Sync**: Listens to `window.visualViewport` resize events (Lines 720–729) to automatically re-align the scroll view above the iOS / Android soft keyboard.
- **Dynamic Composer Height**: Auto-sizes textarea scroll height with a 128px maximum ceiling (Lines 654–659).
- **Haptic Feedback**: Integrates `useHaptics` (`lightTap`) on send, stop, tab change, and action confirmation.

---

## 3. Backend AI Architecture & Execution Pipelines

### 3.1 AI Procedure Factories & Rate Limits (`api/middleware.ts`)
- **File Location**: `api/middleware.ts` (Lines 1–135)
- **Security Guards**:
  - `publicProcedure`: 400 req/min per IP.
  - `strictPublicProcedure`: 25 req/15min per IP.
  - `authedProcedure`: 100 req/min per user (`rateLimitMap`).
  - `aiProcedure`: 100 req/min per user (`aiRateLimitMap`).
  - `proAiProcedure`: Enforces `plan === "pro" | "ultra" | role === "admin"` + AI rate limits.
  - Periodic cleanup interval runs every 5 minutes (`cleanupInterval.unref()`, Lines 39–55) to purge expired keys and prevent Node.js memory leaks.

### 3.2 Chat Router & Plan-First AI Kernel (`api/chat-router.ts`)
- **File Location**: `api/chat-router.ts` (1321 Lines)
- **Core Pipeline**:
  ```
  sendMessage Input
         │
         ▼
  1. Load Settings Cache & Resolve Plan-Aware Cost Policy (resolveAICostPolicy)
         │
         ▼
  2. Check Daily Tier Limits (Free: 20, Pro: 200, Ultra: unlimited)
         │
         ▼
  3. Load/Create chatConversations & Fetch Bounded History (limit 2-12 messages)
         │
         ▼
  4. Clarification Machine Check (Active Slot Filling vs Cancel Detection)
         │
         ▼
  5. Action Text Confirmation Check (resolveTextActionReply)
         │
         ▼
  6. Execute Plan-First Kernel (runAIKernelActive)
         │  ├── Heuristic Intent Routing (routeIntent)
         │  ├── Minimum Data Needs Compilation (compileDataNeeds)
         │  ├── Parallel Fact Resolution (Finance SQL Fast Path + RAG Memory + Site Guide)
         │  ├── Deterministic Synthesis Check (If 100% answerable from SQL -> 0 Tokens, <15ms)
         │  ├── Bounded LLM Call (callChatCompletionAPI via DeepSeek/OpenAI protocol)
         │  └── Numeric Hallucination Validation (validateNumbersAgainstFacts)
         │
         ▼
  7. Generate Two-Phase Pending Action Draft (createPendingRuntimeAction / goal)
         │
         ▼
  8. Save Messages to DB + Asynchronous Semantic Memory Extraction (writeConversationMemory)
         │
         ▼
  9. Record Immutable Audit Ledger & Telemetry Metrics (recordAICostMetric)
  ```

### 3.3 Universal AI Gateway & Metering Ledger (`api/lib/ai-gateway.ts`)
- **File Location**: `api/lib/ai-gateway.ts` (573 Lines)
- **Features**:
  - **Dynamic Route Caching**: Routes requests by `route:${purpose}:${tier}` or explicit `model:${modelId}` using database-backed `aiProviders` and `aiModels` (5-minute TTL cache).
  - **AES-256-GCM Vault**: Encrypts and decrypts provider API keys using `encryptApiKey` / `decryptApiKey` (Lines 117–145).
  - **Token Anatomy Decomposition**: Breaks down token usage into 5 distinct dimensions:
    1. `systemPromptTokens`
    2. `memoryRagTokens`
    3. `historyTokens`
    4. `userInputTokens`
    5. `toolSchemaTokens`
  - **Asynchronous Ledger Recording**: Writes immutable records to `aiTokenLedgers` (Lines 508–559), computing real-money USD and EGP costs using live system exchange rates.

### 3.4 Live Voice Call Architecture (`src/hooks/useVoiceCall.ts` & `/api/voice/live`)
- **AudioWorklet PCM Processor**: Converts microphone float32 audio to 16kHz Int16 linear PCM in 2048-sample chunks (Lines 34–88).
- **Bidirectional WebSocket Protocol**: Connects to `wss://<host>/api/voice/live`, transmitting raw binary PCM chunks and receiving AI audio response chunks with low-latency AudioBuffer playback queue.
- **Live Tool Trace Telemetry**: Dispatches `VoiceTraceEvent` logs (`finance_query`, `memory_search`, `action_draft`) directly to the UI subtitle and telemetry HUD.

---

## 4. Comprehensive Edge-Case & Vulnerability Catalog

The table below catalogs the identified vulnerabilities, edge cases, failure modes, affected files, severity, and remediation strategies:

| ID | Category | Discovered Edge Case / Vulnerability | Affected File(s) & Lines | Severity | Impact | Remediation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **EC-01** | Abort Lifecycle | **Client abort does not cancel server LLM execution**: When user stops generation or times out, client fetch is aborted, but backend procedure continues running to completion, consuming provider tokens and DB CPU. | `api/chat-router.ts:428`, `api/lib/deepseek-client.ts:78`, `api/lib/ai-gateway.ts:446` | **High** | Token waste, server resource exhaustion under frequent aborts. | Propagate `ctx.req.raw.signal` into `callChatCompletionAPI` and Drizzle DB queries. |
| **EC-02** | State Machine | **Tab navigation or unmount loses initial conversation reference**: If user submits first prompt in new chat and navigates to another tab before response arrives, `conversationId` is not saved, orphaning the response. | `src/pages/AICenter.tsx:128`, `src/components/ai/AIChatbot.tsx:661-669` | **Medium** | User returns to empty screen; conversation appears in history but is detached from current view. | Persist active conversation ID in URL query parameter `?convId=X` or local storage draft state. |
| **EC-03** | Race Condition | **Rapid multi-keystroke / double-send race condition**: If user hammers Enter rapidly during the milliseconds before React commits `setIsTyping(true)`, multiple identical requests can fire simultaneously. | `src/components/ai/AIChatbot.tsx:742-750`, `916-922` | **Medium** | Duplicate messages in DB, doubled token billing. | Guard send handler with an immediate synchronous `useRef` lock (`isSendingRef.current = true`). |
| **EC-04** | Timeout Sync | **Client vs Server Timeout Race Condition**: Both client (`AIChatbot.tsx:778`) and server (`deepseek-client.ts:79`, `ai-gateway.ts:447`) have 45s hardcoded timeouts. | `src/components/ai/AIChatbot.tsx:778`, `api/lib/deepseek-client.ts:79` | **Medium** | Client aborts right as server finishes generating, rejecting a valid response. | Set server timeout to 35s and client timeout to 50s to guarantee clean backend-first error propagation. |
| **EC-05** | Rate Limiting | **Rate limit 429 cooldown hardcoded to 10s regardless of server window**: When server returns 429 (which has a 60s window or upstream RPM quota), client countdown only waits 10s. | `src/components/ai/AIChatbot.tsx:839`, `api/middleware.ts:35`, `89` | **Medium** | User retries after 10s and repeatedly hits 429 lockouts. | Return dynamic `retryAfterSeconds` in TRPCError metadata and bind countdown directly to it. |
| **EC-06** | UX / Conversion | **403 Quota Exhaustion lacks direct Pro Upgrade CTA**: When monthly budget or plan allowance is exceeded, message indicates quota exhaustion but offers no one-click upgrade button. | `src/components/ai/AIChatbot.tsx:197-208`, `1128-1150` | **Low** | Reduced conversion to Pro/Ultra plans; user friction. | Render an interactive `<UpgradeToProCard />` directly inside the AI response message stream. |
| **EC-07** | Rendering | **RTL/LTR Arabic Token Splitting in Streamed Prose**: Streaming raw token chunks with mixed Latin/Arabic words or Markdown fences causes temporary cursor jumps and layout thrashing. | `src/components/ai/AIChatbot.tsx:280-338`, `340-490` | **Medium** | Stuttering stream animation, broken typography during live generation. | Implement a chunk accumulator with a 50ms RAF buffer that outputs complete words and closed tags. |
| **EC-08** | Memory Management | **Short-Term Conversation History Windowing**: `chat-router.ts` slices history to `Math.min(maxHistory, 12)`. Unsummarized older turns are omitted from context. | `api/chat-router.ts:522-536` | **Low** | Long conversations may lose context from 15 turns ago if not captured in semantic memory. | Implement rolling summaries via `aiConversationSummaries` capsule injection. |
| **EC-09** | Voice Audio | **iOS Safari AudioContext suspension on lock/tab switch**: When Safari is minimized or screen locks, AudioContext enters `suspended` state, causing silent audio drops. | `src/hooks/useVoiceCall.ts:130-145` | **Medium** | Voice call stays connected over WS but user cannot hear or transmit audio. | Add `document.addEventListener("visibilitychange")` listener to resume AudioContext upon foregrounding. |
| **EC-10** | Multi-Replica | **In-memory Rate Limiting map not shared across server replicas**: `middleware.ts` uses `rateLimitMap` and `aiRateLimitMap` in local Node process memory. | `api/middleware.ts:28-36` | **Medium** | In a multi-replica cluster (e.g. behind nginx/load balancer), user can bypass limits by hitting alternating pods. | Back rate-limiting with Redis `incrWithExpire` in production when `REDIS_URL` is present. |

---

## 5. Detailed In-Depth Technical Analysis

### 5.1 Deep Dive: AbortController Lifecycles & Request Cancellation
In the current implementation of `AIChatbot.tsx`:
```tsx
// AIChatbot.tsx Line 755
const controller = new AbortController();
abortControllerRef.current = controller;

try {
  const result = await sendMessage.mutateAsync({
    message: messageText,
    conversationId: targetConversationId,
  });
} catch (error: any) {
  if (controller.signal.aborted) {
    const reason = controller.signal.reason;
    if (reason === "user_stop") return;
    if (reason === "timeout") { ... }
  }
}
```
**The Problem**:
`sendMessage.mutateAsync` is executed over the tRPC React Query client. When `controller.abort()` is invoked:
- React Query cancels the client-side promise.
- The browser terminates the underlying `fetch()` HTTP stream.
- **However**, on the backend (`api/chat-router.ts`), Hono's execution handler for `sendMessage` continues executing asynchronously:
  1. It finishes computing `runAIKernelActive`.
  2. If an LLM call was dispatched to Fireworks/DeepSeek via `callChatCompletionAPI`, the remote provider completes the generation and charges the account.
  3. The backend writes the assistant message to `chatMessages` and updates `chatConversations.totalTokens`.
- When the user subsequently sends a new prompt, the database now has an "assistant" turn recorded that the user never saw on screen!

**Recommended Architecture**:
Pass Hono's `c.req.raw.signal` through the tRPC context (`Context` in `api/context.ts`):
```ts
// api/context.ts
export type Context = {
  user: UnifiedUser | null;
  ip: string;
  signal: AbortSignal;
};
```
Inside `api/chat-router.ts`, pass `ctx.signal` into `runAIKernelActive` and forward it to `fetch(url, { signal: ctx.signal })` inside `callChatCompletionAPI` and `executeAiGateway`. If the user cancels or closes the tab, the upstream LLM HTTP socket is immediately closed.

---

### 5.2 Deep Dive: Rate-Limit (429) & Quota Handling
SmartSpend enforces a multi-tier rate limiting architecture:
1. **Infrastructure Tier**: `publicIpLimiter` (400 req/min/IP), `strictPublicIpLimiter` (25 req/15min/IP).
2. **User Operational Tier**: `aiProcedure` in `api/middleware.ts` (100 req/min/user).
3. **Product Subscription Tier**: Daily message counts in `api/chat-router.ts`:
   - Free Tier: 20 messages/day.
   - Pro Tier: 200 messages/day.
   - Ultra Tier: Unlimited (999,999 messages/day).
4. **Upstream Provider Quota**: DeepSeek / Gemini / Fireworks rate limits (RPM / TPM).

**Error Formatting Engine (`formatAiErrorMessage`)**:
```ts
// AIChatbot.tsx Lines 180-194
if (
  status === 429 ||
  errCode === "TOO_MANY_REQUESTS" ||
  errStr.includes("429") ||
  errStr.includes("طلبات كثيرة") ||
  errStr.includes("الحد الأقصى لعدد الطلبات")
) {
  return {
    message: "وصلت للحد الأقصى لعدد طلبات الذكاء الاصطناعي حالياً (429). انتظر بضع ثوانٍ وسيعود النظام للعمل تلقائياً.",
    isRateLimit: true,
    isTimeout: false,
    isAborted: false,
    isQuotaExhausted: false,
  };
}
```
**UI Behavior during Cooldown**:
- An animated banner appears above the input:
  ```tsx
  {rateLimitCooldown > 0 && (
    <motion.div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-2 font-medium">
      <Clock className="w-4 h-4 animate-spin shrink-0" />
      <span>تم الوصول لحد الطلبات المؤقت. يرجى الانتظار {rateLimitCooldown} ثانية قبل المحاولة...</span>
    </motion.div>
  )}
  ```
- Send button is disabled (`disabled={!input.trim() || rateLimitCooldown > 0}`).
- Cooldown decrements every 1000ms until zero.

---

### 5.3 Deep Dive: Markdown & RTL Rendering Integrity
Rendering mixed Arabic and English financial content in real-time presents specific typographic challenges:

1. **Number and Currency Inversion**:
   In standard HTML RTL containers (`dir="rtl"`), strings like `500 EGP` or `12.5%` can be inverted by browser BiDi algorithms to `EGP 500` or `%12.5` with trailing negative signs misplaced (e.g. `-500` becoming `500-`).
   - **SmartSpend Fix**: `renderInlineMarkdown` wraps all matched currency tokens in `<bdi>` (Bidirectional Isolation) tags:
     ```tsx
     if (/^[\d,.]+\s*(?:ج\.م|EGP|LE|\$|€|%)$/.test(part.trim())) {
       return (
         <bdi key={index} className="font-semibold text-foreground px-0.5 inline-block">
           {part}
         </bdi>
       );
     }
     ```
2. **Code Blocks & LTR Enforcement**:
   Monospace code snippets, SQL queries, or JSON payloads must always be forced to `dir="ltr"` and left-aligned, regardless of surrounding Arabic copy:
   ```tsx
   <pre className="p-3 overflow-x-auto leading-relaxed select-text" dir="ltr">
     <code>{code}</code>
   </pre>
   ```
3. **Structured Interactive Artifacts**:
   The chat engine is not limited to text; it seamlessly embeds rich interactive React widgets:
   - `metric_card`: Highlights key financial KPIs with color badges.
   - `table`: Formats multi-column expense breakdowns.
   - `chart`: Renders Recharts Bar Charts for monthly spending comparisons.
   - `action_confirmation`: Two-phase interactive action card with "تأكيد" (Confirm) and "إلغاء" (Cancel) buttons.
   - `quick_replies`: Clarification pill buttons for instant one-tap answers.

---

## 6. Concrete Recommended Refactoring & Implementation Plan

### Phase 1: Request Cancellation & Timeout Hardening
1. **Server Signal Propagation**:
   - Update `api/context.ts` to attach `signal: c.req.raw.signal` to tRPC Context.
   - Pass `ctx.signal` to `runAIKernelActive` and `callChatCompletionAPI` to immediately stop external HTTP calls upon client abort.
2. **Timeout Calibration**:
   - Set backend provider timeout to 32 seconds (`timeout: 32_000`).
   - Set frontend client timeout to 45 seconds (`timeout: 45_000`).
   - This guarantees that backend timeouts return a structured Arabic TRPCError before the client forcibly severs the connection.

### Phase 2: Dynamic Rate-Limit Backoff
1. **tRPC Error Metadata Enhancement**:
   - When throwing `TOO_MANY_REQUESTS` in `api/middleware.ts` or `api/chat-router.ts`, include `retryAfterSeconds` in `TRPCError.cause` or metadata.
2. **Frontend Dynamic Timer**:
   - Update `AIChatbot.tsx` to read `error?.data?.retryAfterSeconds || 10` and dynamically adjust `rateLimitCooldown`.

### Phase 3: Token Streaming Architecture (SSE / tRPC Subscription)
For future streaming capability (displaying tokens as they are generated):
1. Mount a dedicated SSE streaming route: `POST /api/chat/stream` in `api/boot.ts` using `streamSSE(c, async (stream) => { ... })`.
2. Push structured events:
   - `event: "intent"` (classified intent & data needs)
   - `event: "token"` (individual prose tokens)
   - `event: "artifact"` (charts/tables/action drafts)
   - `event: "done"` (final usage & tokens ledger)
3. Frontend uses `fetch` with `ReadableStream` reader or EventSource, piping chunks through an RAF-debounced stream smoother.

### Phase 4: Native Mobile / PWA Resilience
1. **AudioContext Auto-Resume**: Add lifecycle listeners in `src/hooks/useVoiceCall.ts` on `visibilitychange` and `pageshow` to wake up suspended AudioContexts when returning from lock screen.
2. **Outbox / Offline Retry**: Enable offline prompt caching in IndexedDB so prompts composed without internet connectivity automatically send when `navigator.onLine` fires.

---

## 7. Verification & Automated Test Matrix

The following test suites in the codebase validate AI routing, memory, action runtime, and error handling:

| Test Suite File | Domain Covered | Key Test Cases |
| :--- | :--- | :--- |
| `api/chat-router.phase0.test.ts` | Base Chat Lifecycle | Conversation creation, message persistence, token limits |
| `api/chat-router.phase1.test.ts` | Intent Routing | Finance SQL fast path vs generative LLM dispatch |
| `api/chat-router.phase4.test.ts` | Memory RAG | Semantic memory retrieval, importance scoring |
| `api/chat-router.phase6.test.ts` | Artifacts & Charts | Chart data rendering, structured artifact generation |
| `api/chat-router.phase9.test.ts` | Action Runtime | 2-phase idempotency, `confirmAction`, `cancelAction` |
| `api/ai-router.test.ts` | AI Procedures | STT, OCR, Monthly insights, rate limit enforcement |
| `api/ai-router.voice-qa.test.ts`| Voice Tools | Live voice tool simulation and JSON formatting |
| `src/hooks/useVoiceCall.test.ts`| Voice Hook | AudioWorklet lifecycle, PCM conversion, WebSocket events |

---

## 8. Conclusion

The SmartSpend AI interaction architecture is robust, highly optimized for Egyptian financial workflows, and incorporates advanced techniques including deterministic zero-cost SQL fast-paths, two-phase idempotent action drafting, hybrid RAG memory, and bidi-isolated Markdown rendering.

By addressing the 10 identified edge cases — specifically propagating cancellation signals across the network boundary, calibrating timeouts, providing dynamic rate-limit countdowns, and hardening PWA tab lifecycles — the platform achieves tier-1 enterprise reliability and zero-regression user experience.
