## 2026-08-29T10:11:45Z

Read e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md and e:/smartspend_V1_fixed/AGENTS.md before starting.
Your working directory is e:/smartspend_V1_fixed/.agents/worker_m1_audio/. Create and maintain progress.md and BRIEFING.md there.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Assigned Scope: M1 (Audio State-Machine) & M3 (Financial Mutations & Idempotency)
Exclusively Owned Files:
- `src/components/expenses/ExpenseForm.tsx`
- `src/hooks/useVoiceCall.ts`
- `src/components/ai/AIVoiceCall.tsx`
- `api/expense-router.ts`
- `api/budget-router.ts`
- `api/goals-router.ts`
- `api/wallet-router.ts`

Step-by-Step Instructions:
1. In `src/components/expenses/ExpenseForm.tsx`:
   - Audio state-machine: Handle immediate cancel/stop with zero-length audio chunks without corrupt payloads or infinite loading states.
   - Add clear toast guidance if microphone permission is denied (NotAllowedError, PermissionDeniedError).
   - Add visibilitychange listener during recording to safely stop recording and release media stream tracks when tab switches or backgrounds.
   - Codec fallback hierarchy: probe MediaRecorder.isTypeSupported("audio/webm;codecs=opus") -> audio/webm -> audio/mp4 -> audio/aac -> default.
   - Add rapid toggle debouncing on record/stop/cancel buttons.
   - In FileReader onstop handler, handle errors and ensure setIsProcessingVoice(false) and setFlowStage("idle") on any error.
   - Financial mutations: Double-tap / multi-submit prevention on form buttons.
   - Boundary numeric validations: reject negative amounts, extreme unbounded numbers, NaN, invalid currency.
   - Handle ER_DUP_ENTRY on clientRequestId deduplication gracefully without 500 error crashes.
2. In `api/expense-router.ts`:
   - In create and batchCreate, catch duplicate clientRequestId collisions gracefully and return the existing expense or friendly response instead of throwing 500.
3. Validate your changes with `npm run check` and vitest tests.
4. Write your comprehensive completion report to `e:/smartspend_V1_fixed/.agents/worker_m1_audio/handoff.md` and notify orchestrator via send_message.
