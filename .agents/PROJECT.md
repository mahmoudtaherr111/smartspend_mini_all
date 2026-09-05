# Project: SmartSpend AI — System-Wide Edge-Case Discovery, State-Machine Hardening & Production Audit

## Architecture
- **Monorepo**: TypeScript 5.9 + React 18 + Vite 7 (Frontend) & Hono v4 + tRPC v11 + Drizzle ORM + MySQL 8 (Backend)
- **Shared Contracts**: `contracts/` directory with strict Zod validation schemas
- **AI Classification & Chat**: 5-layer classification waterfall + AI Agent Action Runtime + Google Gemini / Groq Whisper
- **PWA & Mobile**: Service Worker (Workbox) + Visual Viewport keyboard avoidance + Pull-to-Refresh overscroll isolation + Haptic Feedback
- **Auth & Session**: Dual-Auth (`users` Google OAuth + `localUsers` phone/OTP) + Multi-Tab `BroadcastChannel` synchronization + 401 Form Draft Preservation

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Voice & Audio Recording State Machine | Zero-length audio guards, permission denial Arabic handling, tab backgrounding listeners, Groq Whisper MIME alignment, 30s transcription timeout | M1 | Survey (Explorer 1) |
| 2 | AI Streaming & Agent Interaction | Resilient AbortController lifecycle, dynamic rate-limit backoff from server headers, RTL `<bdi>` currency isolation, unclosed markdown tag parsing, action confirmation status hydration | M2 | Survey (Explorer 2) |
| 3 | Financial Mutations & Ledger Idempotency | `clientRequestId` deduplication across expenses, wallets, and budgets; ACID transaction atomicity; optimistic cache rollback; dead-letter queue for offline outbox | M3 | Survey (Explorer 3) |
| 4 | PWA & Mobile-First UX Stability | Unified `useVirtualKeyboard` & `visualViewport` listener, bottom navigation keyboard avoidance, pull-to-refresh overscroll isolation, native/web haptic triggers | M4 | Survey (Explorer 3) |
| 5 | Auth & Multi-Tab Synchronization | `BroadcastChannel` & storage event token sync, 401 form draft preservation to `sessionStorage`, dual-user (`users` vs `localUsers`) IndexedDB cache isolation | M5 | Survey (Explorer 3) |
| 6 | Comprehensive Edge-Case Test Suites | Automated unit/integration test suites for audio state machines, chat abort controllers, financial idempotency, offline dead-letter queue, and auth sync | E2E | Survey (Explorers 1-3) |
| 7 | Exhaustive Technical Audit Documentation | Authoritative publication-grade audit document `docs/LOGICAL_EDGE_CASES_AUDIT.md` covering all 7 logical edge case domains, failure modes, and mathematical invariants | M6 | Survey (Explorer 3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Audio & Voice Recording Hardening | `src/components/expenses/ExpenseForm.tsx`, `src/hooks/useVoiceCall.ts`, `api/ai-router.ts` | none | IN_PROGRESS |
| M2 | AI Streaming & Agent Interaction Resilience | `src/components/ai/AIChatbot.tsx`, `src/pages/AICenter.tsx`, `api/chat-router.ts` | none | IN_PROGRESS |
| M3 | Financial Ledger, Idempotency & Offline DLQ | `api/wallet-router.ts`, `api/budget-router.ts`, `src/components/expenses/ExpenseForm.tsx` | none | IN_PROGRESS |
| M4 | PWA Viewport & Mobile UX Consolidation | `src/hooks/useVirtualKeyboard.ts`, `src/hooks/usePwaLifecycle.ts`, `src/components/layout/MobileBottomNav.tsx` | none | IN_PROGRESS |
| M5 | Auth Multi-Tab & Session Preservation | `src/hooks/useAuth.ts`, `src/providers/trpc.ts`, `src/lib/queryPersister.ts` | none | IN_PROGRESS |
| M6 | Exhaustive Audit Documentation & Verification | Compile `docs/LOGICAL_EDGE_CASES_AUDIT.md`, run full `npm run check` and vitest validation | M1-M5 | IN_PROGRESS |

## Code Layout & File Ownership Boundaries
- **Worker 1 (Voice & Audio)**: Exclusively owns `src/hooks/useVoiceCall.ts`, `api/ai-router.ts` (Whisper upload MIME alignment).
- **Worker 2 (AI Streaming & Chatbot)**: Exclusively owns `src/components/ai/AIChatbot.tsx`, `api/chat-router.ts`.
- **Worker 3 (Financial Ledger, Idempotency & Offline DLQ)**: Exclusively owns `api/wallet-router.ts`, `api/budget-router.ts`, `src/components/expenses/ExpenseForm.tsx` (offline dead-letter queue & timeout).
- **Worker 4 (PWA, Mobile UX & Auth Sync)**: Exclusively owns `src/hooks/useVirtualKeyboard.ts`, `src/hooks/usePwaLifecycle.ts`, `src/hooks/useAuth.ts`, `src/providers/trpc.ts`.
- **Worker 5 (Audit Documentation & Test Suite Writer)**: Exclusively owns `docs/LOGICAL_EDGE_CASES_AUDIT.md`, `tests/`.

## Interface Contracts
### Voice Upload Contract (`api/ai-router.ts`)
- Accepts `audioFile` with dynamic mime-type detection (`audio/webm`, `audio/mp4`, `audio/wav`, `audio/ogg`).
- Returns `{ transcript: string, confidence: number }` or throws structured `TRPCError`.

### AI Chat Stream & Rate Limit Contract (`api/chat-router.ts`)
- Returns `retryAfterSeconds` in error cause on `TOO_MANY_REQUESTS`.
- `AIChatbot.tsx` consumes `shape.data.retryAfterSeconds` to initialize countdown cooldown.

### Financial Idempotency Contract (`api/wallet-router.ts`, `api/budget-router.ts`)
- Accepts `clientRequestId?: string`.
- Intercepts duplicate submissions and returns existing record without throwing error to client.
