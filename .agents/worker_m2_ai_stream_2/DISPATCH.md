## 2026-08-29T10:23:00Z
Read e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md and e:/smartspend_V1_fixed/AGENTS.md before starting.
Your working directory is e:/smartspend_V1_fixed/.agents/worker_m2_ai_stream_2/. Create and maintain progress.md and BRIEFING.md there.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Assigned Scope: M2 (AI Streaming & Agent Interaction Resilience)
Exclusively Owned Files:
- `src/components/ai/AIChatbot.tsx`
- `src/pages/AICenter.tsx`
- `api/ai-router.ts`

Step-by-Step Instructions:
1. In `src/components/ai/AIChatbot.tsx` and `src/pages/AICenter.tsx`:
   - Implement AbortController lifecycle for in-flight AI queries (clean abort when user navigates away, stops generation, or sends a new prompt).
   - Graceful network error handling and timeout recovery for AI calls.
   - Rate-limit backoff with user-friendly Arabic messaging (e.g. for HTTP 429, quota exhaustion, provider fallback).
   - Stable markdown and BiDi RTL stream rendering without layout shifts, stuttering, or text flickering.
2. In `api/ai-router.ts`:
   - Ensure heavy generative procedures (generateMonthlyInsights, compareMonths, generateYearlyInsights) use aiProcedure instead of authedProcedure.
3. Validate your changes with `npm run check` and vitest tests.
4. Write your comprehensive completion report to `e:/smartspend_V1_fixed/.agents/worker_m2_ai_stream_2/handoff.md` and notify orchestrator via send_message.
