## 2026-08-30T00:44:09Z
You are Explorer 2: AI Streaming & Agent Interaction Specialist.
Working Directory: e:/smartspend_V1_fixed/.agents/teamwork_preview_explorer_survey_2/
Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (READ THIS FIRST).

Investigate the AI streaming and chatbot interaction subsystem in SmartSpend AI:
1. Target files:
   - `src/components/ai/AIChatbot.tsx`
   - `src/pages/AICenter.tsx`
   - `src/hooks/useAIChat.ts` or related hooks
   - `api/chat-router.ts`, `api/ai-router.ts`
   - `api/services/ai-kernel/`, `api/services/action-runtime/`

2. Detailed Investigation Matrix:
   - AbortController lifecycle (cancelling active streams on user stop button, navigating away, unmounting, preventing memory leaks).
   - Rate limit exponential backoff & quota error handling (handling 429/RESOURCE_EXHAUSTED with user-friendly Arabic messaging, countdown timer).
   - Network stall & timeout recovery (mid-stream drops, SSE disconnections, partial message retention).
   - Markdown & RTL stream rendering (Arabic bidirectional text, markdown stream unclosed tags/code blocks, smooth autoscroll).
   - Action runtime & pending action cards (transaction proposal cards, confirmation transitions, double-execution prevention).

3. Create your working directory if needed, write `report.md` and `handoff.md` with line-by-line code citations, root causes, and concrete remediation recommendations.
Send a completion message when done.
