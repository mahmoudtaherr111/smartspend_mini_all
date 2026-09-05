## 2026-08-29T12:05:14Z
You are Worker M2 (worker_m2_ai_streaming).
Working Directory: e:/smartspend_V1_fixed/.agents/worker_m2_ai_streaming
Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
Project Spec: e:/smartspend_V1_fixed/PROJECT.md
Survey Report: e:/smartspend_V1_fixed/.agents/explorer_ai_streaming/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- `src/components/ai/AIChatbot.tsx`
- `src/pages/AICenter.tsx`
- `api/chat-router.ts`
- `api/middleware.ts` (429 rate-limit metadata)

Your Tasks:
1. Read `e:/smartspend_V1_fixed/.agents/explorer_ai_streaming/report.md` for detailed analysis.
2. In `api/middleware.ts` and `api/chat-router.ts`, pass dynamic `retryAfterSeconds` in rate-limit 429 errors so the client knows exact remaining cooldown.
3. In `src/components/ai/AIChatbot.tsx`:
   - Synchronize rate-limit cooldown timer with the backend 429 `retryAfterSeconds` and provide clear, empathetic Arabic messaging.
   - Calibrate client timeout (45s) with backend provider timeouts (32s-45s) and retain partial user drafts on timeout with easy retry button.
   - Harden markdown and RTL bidi rendering: ensure code blocks enforce LTR, monetary amounts (`ج.م`, `EGP`, numbers) use `<bdi>` wrappers to prevent inversion, and unclosed code fences / bold tags parse without crashing or flickering.
4. In `src/pages/AICenter.tsx`:
   - Preserve conversation draft state, active prompts, and conversation IDs across tab changes so switching tabs does not reset an ongoing interaction.
5. Run `npm run check` and vitest chat tests (`npx vitest run api/chat-router.phase0.test.ts api/chat-router.phase1.test.ts`).
6. Write `progress.md` and `handoff.md` in your working directory. Send a completion message back when done.
