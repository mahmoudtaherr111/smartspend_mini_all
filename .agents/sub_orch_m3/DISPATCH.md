## 2026-08-30T12:40:23Z
You are the implementation worker for Milestone 3: Directional Spatial Transitions & Tab State Keep-Alive.
Your working directory is: e:/smartspend_V1_fixed/.agents/sub_orch_m3
Please read:
- e:/smartspend_V1_fixed/.agents/sub_orch_m3/SCOPE.md
- e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
- e:/smartspend_V1_fixed/PROJECT.md
- e:/smartspend_V1_fixed/.agents/explorer_survey_2/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement all Milestone 3 components:
1. Create src/hooks/useNavigationDirection.ts (tracks PUSH/POP depth in RTL).
2. Create src/hooks/useScrollRestoration.ts (restores and saves scroll offsets keyed by route).
3. Update src/components/layout/PageTransition.tsx with hardware-accelerated RTL slide variants and Framer Motion.
4. Wire useScrollRestoration to <main ref={scrollRef}> in src/App.tsx.
5. Refactor src/pages/AICenter.tsx to use offscreen keep-alive for tabs (AIChatbot, AIVoiceCall, AIMonthlyReport) so state, chat messages, voice connections, and scroll positions are retained.
6. Refactor sub-views in src/pages/Settings.tsx with spatial slide transitions and state retention.
7. Run `npm run check` and `npm run test`.
8. Write handoff report to e:/smartspend_V1_fixed/.agents/sub_orch_m3/handoff.md. Update progress.md regularly. Report back via send_message when finished.
