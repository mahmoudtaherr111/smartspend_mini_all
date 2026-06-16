# AI Center Completion Audit - 2026-06-15

## Scope

هذا الملف يراجع الهدف النهائي: Agent مركزي واحد للشات والصوت والتقارير يستخدم routing + tools + memory + actions + cache/cost policy، ويقلل التكلفة بدون فقدان الدقة.

## Verified Now

- Chat finance direct answers:
  - Browser prompt: `صرفت كام النهارده؟`
  - Trace: `finance_query`, `finance.summary`, `retrieval=skipped`, `embedding=none`, `embeddingCalls=0`, `LLM 0`.

- Category total with evidence:
  - Browser prompt: `صرفت كام أكل الشهر ده بالظبط؟ وهات العمليات اللي اتحسبت`
  - Trace: `finance.category_total, finance.transactions`, `embedding=none`, `LLM 0`.
  - Fixed during this audit: the answer now lists five supporting rows when five operations were counted, instead of showing only three.

- Chart artifact:
  - Browser prompt: `ارسملي مصاريف الأكل آخر 6 شهور`
  - Trace: `chart_request`, `chart.data`, `embedding=none`, `LLM 0`.
  - UI renders six accessible `chart-point` rows.

- Site guide:
  - Browser prompt: `ازاي اربط الفيزا بالرسائل SMS؟`
  - Trace: `site_help`, `site_guide.search`, `retrieval=static_local`, `embedding=none`, `LLM 0`.
  - No action draft is created for help/explanation questions.

- Semantic memory:
  - Browser prompt: `فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟`
  - Trace: `memory_question`, `memory.search`, `retrieval=fireworks_qwen`, `embedding:fireworks`, `embeddingCalls=1`.
  - Retriever selection now prefers direct semantic memory over noisy conversation capsules for both chat and voice.
  - Fresh traces now include `embeddingApiStatus`: live semantic retrieval reports `fireworks_live_call`, repeated recall-only prompts can report `semantic_result_cache_hit` with `embeddingCalls=0`, and SQL finance questions report `skipped`.
  - Fixed during this audit: recall-only conversations no longer invalidate semantic memory cache when they only write low-signal summaries, avoiding repeated Fireworks calls for the same memory question.

- Mixed advice + memory:
  - Browser prompt: `اعمل لي خطة أظبط القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده بخطوات ذكية`
  - Trace: `advice_request`, small facts pack, `memory.search`, `retrieval=fireworks_qwen`, `embeddingCalls=1`, `LLM 1`.

- Action draft/cancel:
  - Browser prompt: `اربط كارت فيزا آخر 9876`
  - Trace: `action_request`, `embedding=none`.
  - UI showed confirmation card and cancellation changed the card to `تم الإلغاء`.
  - Browser execution was then tested with a QA-only wallet fingerprint: `اربط كارت فيزا آخر 8642 رصيد 9091`.
  - The UI confirmation executed successfully, DB verification found the created wallet, `ai_pending_actions.status=executed`, audit events `draft_created/confirmed/executed`, and an `ai_action_memory` row.
  - The QA wallet/action/audit/action-memory rows were cleaned afterward by the same exact fingerprint and post-cleanup counts were zero.
  - This execution QA exposed a routing bug: adding `رصيد 9091` made the trace report `finance_query` even though the action still executed. The router now treats direct card/wallet link/create requests as `action_request` even when they include an initial balance.
  - Browser retest with `اربط كارت فيزا آخر 8643 رصيد 9092` showed `route=action_request`; the draft was cancelled and cleaned.

- Monthly report and comparison:
  - Browser report tab shows `report-ai-trace route=report_request tools=monthly_report.facts`, `facts=8`, `source=semantic_live`, `LLM=0`, `embed=0`, `nums 100%`.
  - Browser comparison QA shows `compare-ai-trace route=finance_period_comparison tools=finance.summary`, `LLM=0`, `embed=0`, `nums 100%`.

- Voice:
  - Voice backend tests prove `finance_query` skips embeddings and `memory_search` reports `fireworks_qwen`.
  - Voice prefetch is now structured-only: it prefetches hot SQL/profile facts and explicitly skips `memory.search`, `site_guide.search`, charts, and transaction evidence. This prevents spending Qwen/Fireworks embeddings before an explicit `memory_search` voice tool call.
  - Browser voice tab opens and start call reaches the expected Arabic microphone permission message.
  - Browser voice tool QA now runs the real voice adapter without microphone input through `/ai?ai_tab=voice&voice_qa_tool=...`.
  - Clean-port browser QA verified `finance_query` -> `finance.summary`, `embeddingApiStatus=skipped`, `embeddingCalls=0`.
  - Clean-port browser QA verified `memory_search` -> `retrieval=fireworks_qwen`, `embedding:query_embedded`, `embedding:fireworks`, `embeddingCalls=1`, `embeddingApiStatus=fireworks_live_call`.
  - Clean-port browser QA verified `action_draft` creates a draft path with `embeddingApiStatus=skipped`, no execution.
  - Live voice WebSocket now enforces `voicePolicy.maxToolRounds` before retrieval/draft tools call `executeVoiceTool`, returning a structured `voice_tool_limit_exceeded` response to Gemini/UI instead of allowing unbounded tool loops.
  - Voice `action_confirm` and `action_cancel` are intentionally exempt from the retrieval/draft tool-round counter, so a discussed `action_draft` can still be executed or cancelled after explicit user confirmation.
  - Follow-up browser voice QA on the data-rich `Codex AI Tester` account verified `finance_query` -> `embeddingApiStatus=skipped`, `memory_search` -> `fireworks_live_call` with `embedding:rows:26`, and `action_draft` -> no embedding/no execution.
  - Source/contract coverage now verifies the live WebSocket path uses `VOICE_TOOL_DECLARATIONS`, `buildVoiceHotContext`, `buildVoiceSystemPrompt`, `executeVoiceTool`, voice prefetch, and voice archive persistence, with no fallback to legacy `TOOL_DEFINITIONS` / `executeTool`.
  - Voice prompt coverage verifies the non-mic contract: smallest matching tool first, no invented financial numbers, draft before explicit confirmation, and high-risk actions require UI confirmation.

- Dev QA safety:
  - Source guards now cover chat QA prompt, voice tool QA, dashboard expense QA, report comparison QA, and local-token callback. These paths are gated by `import.meta.env.DEV` in the UI and/or `env.NODE_ENV === "production"` rejection on the server.
  - `devQaBypassDailyLimit` is ignored in production and only works for automated dev QA.

- Redis:
  - Added a real Redis integration gate: `npm run test:redis`.
  - The gate checks production-style Redis cache miss/hit, runtime status `backend=redis`, pattern invalidation, and post-invalidation miss.
  - Current machine has no Redis/Docker/WSL Redis service listening on `localhost:6379`, so the gate currently fails with `ECONNREFUSED` until Redis is started.

- Verification commands:
  - `npm run check` passed.
  - Focused Redis/QA/voice tests passed except the real Redis integration test, which is skipped unless explicitly enabled: `7` files passed, `1` skipped; `24` tests passed, `1` skipped.
  - `npm test` passed: `59` files passed, `1` skipped; `345` tests passed, `1` skipped.
  - `npm run test:redis` correctly failed on this machine because no Redis server is running at `localhost:6379`.

## Remaining Gaps

- Redis is not running in this local machine. Local development uses RAM fallback; production must provide Redis or cache will be disabled by policy. A real integration gate now exists and fails fast when Redis is configured but unavailable.
- Redis configured-but-down behavior is now regression-covered: failed connection attempts use bounded timeout/reconnect-off behavior and fall back according to policy instead of hanging AI/voice requests.
- Full live voice conversation cannot be proven in the current browser automation because microphone permission/audio streaming is blocked by the environment; the underlying voice tools are now browser-tested through the dev-only QA path.
- Browser automation still cannot type directly into textareas because the Browser Use virtual clipboard is unavailable; QA query paths cover the same app flows without manual typing.
- The default free `Voice QA User` test account had hit the chatbot daily limit and stopped emitting fresh chat traces. Automated dev QA now bypasses daily limits only through `/ai?ai_qa_prompt=...` via `devQaBypassDailyLimit`, while normal users and production still enforce plan limits.
- Existing old conversations may still contain historical stored artifacts; fresh responses are schema-versioned so QA can distinguish current-runtime results.

## Final Hardening Addendum - 2026-06-16

- Closed the remaining parser unification gap: `parseExpense` and `parseVoiceExpense` are now explicit `classification_engine.v1` nodes with `agentBoundary=independent_classification_engine`, not silent legacy paths.
- Expanded confirmed actions to include `goal.update`, `goal.stop`, `expense.recategorize`, and `wallet.update`, all behind server-side validation, confirmation, audit logs, action memory, and `userId/userType` scoped DB mutations.
- Voice action drafting now uses the same runtime contract as chat; high-risk voice actions require UI confirmation.
- Added admin cost analytics through `admin.getAICostOverview`, with aggregates for tokens, LLM calls, embedding calls, tool calls, latency, cache hit rate, fallback rate, channel, route, and user.
- Verified with focused tests, security regression tests, `npm run check`, `npm run build`, and a production-like `/health` smoke. See `docs/AI_CENTER_FINAL_HARDENING_2026-06-16.md`.
- Confirmed action execution is now browser-tested with a QA fingerprint and DB cleanup. Because cleanup happened outside the running app process, any in-process RAM cache copy may persist only until its short TTL expires; Redis-backed production invalidation remains the correct operational path.
