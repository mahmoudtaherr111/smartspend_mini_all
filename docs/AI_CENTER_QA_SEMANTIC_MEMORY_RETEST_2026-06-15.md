# AI Center QA Retest - Semantic Memory Systemization

Date: 2026-06-15

## Backend Verification

- `npm run check` passed.
- Expanded AI suite passed: `23` test files, `71` tests.
- Focused voice/memory regression passed: `6` test files, `13` tests.
- Fireworks Qwen embedding is active for memory retrieval:
  - `embedding:query_embedded`
  - `embedding:fireworks`
  - `embedding:rows:22`
- Fresh memory smoke for camera + mobile returned both memories:
  - `intent=memory_question`
  - `dataNeeds=[memory.search]`
  - `factCount=2`
  - `llmCalls=0`
  - response included both camera and mobile goals.
- Fresh chart smoke returned current artifact values:
  - `chart.data`
  - six monthly points
  - `2026-06=659.5`
  - `llmCalls=0`

## Browser Verification

- `/ai` loads for the local tester user.
- Quick action `صرفت كام النهاردة؟` returned:
  - `ai-trace route=finance_query tools=finance.summary embedding=none`
  - `LLM 0`
  - `embed 0`
- After expanding the chat trace, the UI shows cache runtime:
  - `cache backend`
  - `memory / redis off / ram 11`
- Finance cache hit/miss tracing is visible in the same UI trace:
  - browser trace example: `finance_cache:miss:memory:summary:today:2026-06-15:2026-06-15:salary_1`
  - backend two-call smoke in the same process returned first `finance_cache:miss:memory:summary:today...` then `finance_cache:hit:memory:summary:today...`
  - latency dropped from about `557ms` on miss to about `5ms` on hit in the local RAM fallback smoke.
- Saved memory conversation shows Fireworks trace in the UI:
  - `ai-trace route=memory_question tools=memory.search embedding=embedding:query_embedded, embedding:fireworks, embedding:rows:22`
- Saved chart conversation shows chart artifacts and `chart-point` accessibility rows.
- Old saved chart artifacts can still show old rounded values such as `660`; fresh backend generation returns `659.5`.
- Monthly report tab now shows a report trace panel:
  - `report-ai-trace route=report_request tools=monthly_report.facts risk=low`
  - `facts=8`
  - `source=semantic_live`
  - `LLM=0`
  - `embed=0`
  - `nums 100%`
- Voice tab lazy-loads correctly after waiting for the component.
- Voice start smoke reaches the Arabic microphone-permission message:
  - `محتاج تفتح إذن الميكروفون من المتصفح عشان نبدأ المكالمة الصوتية`

## Voice Backend Verification

- Voice hot context now loads recent memory hints from SQL recents only at call start; it does not call semantic vector retrieval until the explicit `memory_search` voice tool is used.
- Voice HOT_FACTS preserves decimal finance values such as `2337.5` instead of rounding them to `2338`.
- Live backend smoke for user `27/local` rendered voice HOT_FACTS with `today: expense=2337.5`, then `finance_query` returned `finance.summary` with `finance_cache:hit:memory:summary:today...`, while `memory_search` returned `embedding:query_embedded`, `embedding:fireworks`, and `embedding:rows:22`.
- `finance_query` returned `dataNeeds=[finance.summary]`, no embedding.
- `memory_search` returned:
  - `factCount=2`
  - `embedding:query_embedded`
  - `embedding:fireworks`
  - `embedding:rows:22`

## New Fixes Covered

- Deterministic semantic memory extraction now captures preferences, constraints, commitments, and product-help friction without an LLM call.
- Duplicate Fireworks embedding writes are skipped when a memory already has a vector for the same model/dimensions.
- Chat awaits memory persistence only when a turn contains semantic memory candidates, reducing immediate recall races without slowing ordinary finance questions.
- Chat and voice traces now include cache runtime status so QA can see Redis vs RAM fallback per response/tool result.
- Finance tools now add cache hit/miss events to `cacheHits`; cache labels omit user identifiers and show the capability/period instead.
- Voice call startup no longer spends a Qwen/Fireworks embedding request just to build hot context; embeddings stay reserved for explicit memory questions.
- Monthly report JSON now includes safe `ai_trace` and no raw `finance_ai:userId:userType...` cache key in user-visible output.
- Monthly report backend fallback no longer attempts a Groq/LLM request with model `backend` after token limits are exhausted; smoke returned `provider=backend`, `llmCalls=0`, and numeric accuracy `100%`.
- Month comparison no longer uses a legacy LLM prompt or raw expense summing. Backend smoke for `2026-06` vs `2026-05` returned `model=semantic-deterministic`, `route=finance_period_comparison`, `tools=[finance.summary]`, `llmCalls=0`, `embeddingCalls=0`, `factsSource=semantic_live`, `numericAccuracy=100%`, and `totalTokens=157`.
- Yearly insights no longer use a legacy LLM prompt or raw yearly expense summing. Backend smoke for `2026` returned `model=semantic-deterministic`, `route=yearly_report`, `tools=[finance.summary, chart.data, finance.breakdown]`, `llmCalls=0`, `embeddingCalls=0`, `factsSource=semantic_live`, `numericAccuracy=100%`, and `totalTokens=539`.
- Chat no longer falls back to `processAIChatMessage` when AI Kernel is enabled but the deprecated primary flag is false. Backend smoke for `صرفت كام النهارده؟` returned `mode=active`, `intent=finance_query`, `tools=[finance.summary]`, `llmCalls=0`, `embeddingCalls=0`, `legacyPath=disabled`, and answer facts from `finance.summary`.
- Browser quick-action QA for `💰 صرفت كام النهاردة` now shows the in-chat trace panel: `ai-trace route=finance_query tools=finance.summary embedding=none cache=memory risk=low`, with `LLM 0` and `embed 0`.
- Expense parsing no longer loads the whole current month or passes unused `recentTransactions`; it uses semantic `finance.summary` for verifier context and records `parse` cost metrics. Backend smoke for `دفعت 50 جنيه قهوة` returned `parsedBy=rule_engine`, `decision=auto_save`, `confidence=98`, `llmCalls=0`, `embeddingCalls=0`, and `financeContextSource=finance.summary`.
- Recorded-audio parsing now uses the same semantic `finance.summary` verifier context and records separate `speech` and `parse` cost metrics, so STT and classifier cost can be audited independently.
- Parser trace is now returned by the API and covered by `api/services/parser-trace.test.ts`: local rule-engine parses report `inputTokens=0`, `llmCalls=0`, `embeddingCalls=0`; hybrid voice parses include STT model/tokens/duration separately.
- Fireworks Qwen diagnostic now confirms the configured model/key path works server-side with `fallback=false`, `dimensions=768`, and `vectorLength=768`; current DB state is `23` memory rows and `22` stored Fireworks vectors.
- Memory reranking now treats generic planning words such as `الخطة` and glue words such as `عشان` as non-subject tokens. Backend smoke for `فاكر الخطة اللي اتكلمنا عنها عشان الموبايل؟` now returns only the mobile goal, with `memory.search`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:22`, `llmCalls=0`, `tokens=109`, and `hallucinationRisk=low`.
- Expense form now renders a lightweight `parser-trace` panel from the parser API response so browser/manual QA can see `route`, `tools`, `parsedBy`, `decision`, provider, LLM calls, embedding calls, token counts, `financeContextSource`, and risk after text or voice parsing.
- Backend parser smoke for `دفعت 50 جنيه قهوة` returned `decision=auto_save`, `amount=50`, category `أكل وشرب`, subcategory `قهوة وكافيه`, and trace `expense_parse -> smart_pipeline/rule_engine`, `LLM=0`, `embedding=0`, `tokens=0`, `financeContextSource=finance.summary`, `risk=low`.
- Monthly report prompts now guard against raw transaction expansion: individual transaction examples are hard-capped at `4`, labeled `LIMITED_TRANSACTION_EVIDENCE`, and prompt instructions now explicitly forbid using raw transactions beyond that evidence. Regression coverage: `api/ai-router.monthly-report-guard.test.ts`.
- Personal memory vector search is now regression-covered for user isolation: SQL memory retriever source guard checks `userId/userType` filters on embeddings, summaries, memory items, and action memory; local/quantized stores exclude cross-user hits; Qdrant search sends a `must` filter for `userId/userType` and drops mismatched payloads defensively.
- AI Kernel responses now include an explicit `retrievalPolicy` debug field so QA can distinguish `fireworks_qwen` memory retrieval from intentional `skipped` SQL/chart/tool facts and zero-API `static_local` site-guide vectors.
- Browser QA on `/ai` verified the saved memory conversation exposes `retrieval=fireworks_qwen` in `ai-trace`, and expanding the trace shows `retrieval policy -> fireworks_qwen`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:22`, and `cache backend -> memory / redis off / ram 5`.
- Fireworks smoke after cleanup returned `ok=true`, `fallback=false`, `dimensions=256`, `vectorLength=256`, and elapsed about `519ms`; config loaded with `ai_memory_embedding_enabled=true`, model `accounts/fireworks/models/qwen3-embedding-8b`, memory dimensions `768`, short dimensions `256`, and `22` stored vectors for `23` memory items.
- Follow-up Fireworks diagnostic returned `ok=true`, `fallback=false`, `dimensions=256`, and `vectorLength=256`; system settings also show `ai_memory_embedding_enabled=true`, provider `fireworks`, and the Qwen3 8B model.
- Memory embedding backfill repaired the single missing vector: scanned `23`, inserted `1`, skipped existing `22`, fallback `0`, failed `0`; the DB now has `23/23` active memories with Qwen3 8B `768`-dimension vectors.
- Backend memory retrieval smoke for `فاكر موضوع القهوة والنوم؟` selected the coffee/sleep plan memory with confidence `1` and trace `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:23`.
- Current local smoke confirms the same path is live: direct `FireworksEmbeddingClient` returned `fallback=false`, `cacheHit=false`, `requestModel=accounts/fireworks/models/qwen3-embedding-8b`, and `vectorLength=256`; AI Kernel memory retrieval for `فاكر موضوع القهوة والنوم؟` returned `memory.search`, `retrievalPolicy=fireworks_qwen`, `embeddingCalls=1`, `embedding:rows:23`, `llmCalls=0`, and the DB has `23/23` memory vectors.
- Memory retrieval provenance is now preserved on Redis memory-cache hits by keeping the original embedding trace alongside `memory_cache:hit`, so QA can still distinguish cached semantic retrieval from SQL-only questions.
- Mixed finance+memory retrieval policy is regression-covered: a question that needs both structured finance facts and `memory.search` no longer reports embedding as skipped when semantic memory was involved or expected.
- Voice tool responses now carry the same `retrievalPolicy` contract. Live backend smoke for user `27/local` returned:
  - `finance_query`: `dataNeeds=[finance.summary]`, `retrievalPolicy.embedding=skipped`, reason `structured_sql_or_cached_facts_do_not_need_embedding`.
  - `memory_search`: `dataNeeds=[memory.search]`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:22`, `retrievalPolicy.embedding=fireworks_qwen`, `vectorRows=22`, and `factCount=2`.
- Voice prefetch is now guarded against hidden embedding cost. It only resolves hot structured needs such as `finance.summary`, `finance.category_total`, `wallet.summary`, `finance.goal_progress`, `profile.snapshot`, and `goals.active`; `memory.search` is recorded as `voice_prefetch:skipped:memory.search` and left for the explicit `memory_search` voice tool.
- Regression coverage for voice retrieval policy is in `api/services/voice-kernel/voice-tool-adapter.test.ts`; targeted run passed with `15` tests across voice adapter/prefetch and kernel retrieval-policy tests.
- Chat action confirmations are now regression-covered end to end at the router level:
  - Short `موافق` in the same conversation routes to `action.confirm`.
  - Short `إلغاء` in the same conversation routes to `action.cancel`.
  - A pending action in a different conversation is not executed by a stray confirmation reply.
  - Direct confirm/cancel mutations now pass `conversationId` into the action runtime, and runtime confirmation rejects actions that belong to another conversation.
  - Targeted run passed: `api/chat-router.phase4.test.ts`, `api/services/action-runtime/index.test.ts`, and `api/services/action-runtime/goal-create.test.ts` (`12` tests).
- Live action smoke created and confirmed a goal for isolated QA user `999901`, then cleaned the generated `financial_goals`, `ai_pending_actions`, `ai_action_memory`, and `ai_action_audit_logs` rows.
- Backend Unicode smoke, using codepoint-built Arabic to avoid terminal encoding issues, verified:
  - `صرفت كام النهارده؟` -> `finance_query`, `finance.summary`, `LLM=0`, embedding skipped, risk low, `95` tokens.
  - `فاكر موضوع القهوة والنوم؟` -> `memory_question`, `memory.search`, `embedding:fireworks`, `embedding:rows:23`, `retrievalPolicy=fireworks_qwen`, `108` tokens.
  - `ارسملي مصاريف الأكل آخر 6 شهور` -> `chart_request`, `chart.data`, chart artifact, `LLM=0`, embedding skipped, `115` tokens.
  - `ازاي اربط الفيزا بالتطبيق؟` -> `site_help`, `site_guide.search`, static local `256` vectors, `LLM=0`, `160` tokens.
- Browser `/ai` quick action QA verified visible trace for finance:
  - `ai-trace route=finance_query tools=finance.summary retrieval=skipped embedding=none cache=memory risk=low`
  - visible summary: `Trace: finance_query · tools 1 · LLM 0 · embed 0`
- Browser saved memory conversation QA verified visible trace:
  - `ai-trace route=memory_question tools=memory.search retrieval=fireworks_qwen embedding=embedding:query_embedded, embedding:fireworks, embedding:rows:22 cache=memory risk=low`
- Browser voice tab opens and the start button reaches the expected microphone permission message: `محتاج تفتح إذن الميكروفون من المتصفح عشان نبدأ المكالمة الصوتية`.

## Unified Contract Coverage

- Added unified active-kernel contract coverage in `api/services/ai-kernel/agent-contract.test.ts`:
  - real Arabic finance question -> `finance.summary`, embedding skipped, `LLM=0`.
  - real Arabic memory question -> `memory.search`, `retrievalPolicy=fireworks_qwen`, `embedding:rows:23`, `LLM=0`.
  - real Arabic chart question -> `chart.data`, chart artifact, `LLM=0`.
  - real Arabic site help question -> `site_guide.search`, `retrievalPolicy=static_local`, `dimensions=256`, `LLM=0`.

## Cache Runtime Guard

- Redis/RAM cache behavior is now explicit in `api/lib/redis-client.ts`: development and test can use the in-process RAM fallback when `REDIS_URL` is missing, but production reports `backend=disabled` and recomputes cacheable work unless Redis is configured or `AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION=true` is deliberately set.
- Regression coverage in `api/lib/redis-client.test.ts` verifies all three cache modes: development RAM fallback, production cache-disabled without Redis, and explicit emergency RAM fallback in production.
- Regression coverage now also verifies the configured-but-unavailable Redis case: when `REDIS_URL` is present but `connect()` fails/refuses, the client uses a bounded connect timeout/reconnect-off configuration, cleans up the failed client, reports `redisConfigured=true`, `redisConnected=false`, and falls back according to cache policy instead of hanging AI/voice requests.
- This prevents a production deployment from looking healthy while silently relying on per-process RAM cache instead of the agreed Redis-backed cache layer.
- Voice session state now follows the same cache runtime policy. If Redis is unavailable and memory fallback is disabled, voice call startup fails with a clear server message instead of silently storing session state in process RAM. Regression coverage: `api/services/voice-kernel/voice-session-state.test.ts`.
- `memory.search` now uses the shared cache wrapper, so semantic memory retrieval records `memory_cache:miss|hit:<backend>` alongside the original embedding provenance. Backend smoke for the same Arabic memory query returned first `memory_cache:miss:memory`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:23`, then `memory_cache:hit:memory` with the same selected camera/mobile memories.
- Memory cache invalidation is now wired to both new conversation memories and executed actions. `writeConversationMemory` invalidates `ai_memory:<userId>:<userType>:*` after updating summaries/items, and `confirmAction` invalidates the same cache after inserting `aiActionMemory`, preventing stale recall after new chat/voice memories or confirmed website actions. Regression coverage: `api/services/ai-memory/memory-writer.invalidation.test.ts` and `api/services/action-runtime/index.test.ts`.
- Runtime invalidation smoke for user `27/local` returned: first memory query `memory_cache:miss:memory`, second query `memory_cache:hit:memory`, `invalidateMemoryUserCache` deleted `1` key, and the third query returned `memory_cache:miss:memory` again.
- Browser finance trace QA exposed a UX trust issue: the response said `11` expense operations while the trace showed `transaction_count=13` because it displayed all transaction types. The trace fact ordering now prioritizes `expense_count`, and the browser retest shows `finance.summary.expense_count = ١١`, matching the response.
- Embedding cost accounting now separates semantic provenance from actual Fireworks API calls. A cached memory response can still show `embedding:fireworks` / `embedding:rows:*` as retrieval provenance, but `embeddingCalls=0` when `memory_cache:hit:*` served the result. Regression coverage: `api/services/ai-kernel/phase3-memory.test.ts`, `api/services/voice-call-service.test.ts`, chat trace UI, and voice trace UI.
- Chat and voice traces now expose `embeddingApiStatus` so QA can distinguish `fireworks_live_call`, `query_embedding_cache_hit`, `semantic_result_cache_hit`, `static_local`, `skipped`, and fallback/disabled states without guessing from the Fireworks dashboard.
- Browser retest exposed a hidden cost bug: recall-only prompts such as "remember the coffee/sleep plan?" were writing low-signal summaries and invalidating the semantic memory cache, causing repeated Fireworks calls for the same query. `writeConversationMemory` now invalidates memory cache only when the new/previous capsule or extracted memories can affect retrieval. Browser retest for the same memory prompt twice returned `embeddingApiStatus=semantic_result_cache_hit` and `embeddingCalls=0` both times.
- Fireworks embedding Redis cache keys are now scoped by both `userType` and `userId` (`oauth:1` vs `local:1`) so query-vector caching cannot cross user identity namespaces. Regression coverage: `api/services/ai-memory/embedding-client.test.ts`.
- LLM prompt packing now rejects raw transaction expansion: advice prompts exclude `finance.transactions`, and non-advice prompts cap transaction evidence at five rows. Regression coverage: `api/services/ai-kernel/phase2-resolution.test.ts`.
- Embedding boundary coverage now verifies Fireworks embeddings are not used inside finance/transaction resolvers, keeping Qwen reserved for memory/vector flows instead of embedding every transaction. Regression coverage: `api/services/ai-memory/vector-store.test.ts`.
- AI Kernel now blocks unsupported financial numbers from LLM output before the user sees them. The response is replaced with facts-only safe content and the blocked numbers are recorded in `debug.numericGuard`. Regression coverage: `api/services/ai-kernel/phase2-resolution.test.ts`.
- Action execution is server-bound to the originating conversation for both chat-text confirmations and UI card buttons. Regression coverage verifies validation, required confirmation, same-conversation execution, cross-conversation rejection, and no accidental goal insertion.
- Legacy chat tools now keep the same JSON envelope contract, and `get_app_guide` returns structured `site.guide.v1` sections/steps instead of a raw text blob. Regression coverage: `api/services/ai-chat-tools.test.ts`.

## Browser Retest - Current Runtime

- `/ai` quick finance action was re-tested visually. The response showed `2,337.5` EGP from `11` expense operations and the visible trace was `route=finance_query`, `tools=finance.summary`, `retrieval=skipped`, `embedding=none`, `embeddingCalls=0`, `LLM 0`, and `risk=low`.
- A saved memory conversation was opened visually. The response recalled the camera/mobile goal memories and the visible trace was `route=memory_question`, `tools=memory.search`, `retrieval=fireworks_qwen`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:22`, `embeddingCalls=1`, and `LLM 0`.
- The voice tab opened and the start button reached the expected Arabic microphone-permission state: `محتاج تفتح إذن الميكروفون من المتصفح عشان نبدأ المكالمة الصوتية.`
- Voice now has a dev-only browser QA path for real voice tools without microphone input: `/ai?ai_tab=voice&voice_qa_tool=finance_query|memory_search|action_draft`.
- Browser voice QA on a clean dev port verified `finance_query` uses `finance.summary`, `retrieval=skipped`, `embedding=none`, `embeddingCalls=0`, and `embeddingApiStatus=skipped`.
- Browser voice QA verified `memory_search` uses the same Qwen/Fireworks memory path as chat: `retrieval=fireworks_qwen`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:0` for the new QA user, `embeddingCalls=1`, and `embeddingApiStatus=fireworks_live_call`.
- Browser voice QA verified `action_draft` creates a safe draft path with `embedding=none`, `embeddingCalls=0`, and no execution before confirmation.
- Live voice WebSocket now enforces `voicePolicy.maxToolRounds` before executing Gemini-requested retrieval/draft tools. Extra retrieval/draft tool calls return `voice_tool_limit_exceeded:<limit>` to Gemini and the UI trace without calling `executeVoiceTool`, while `action_confirm` and `action_cancel` remain allowed so explicit user confirmation can still execute or cancel a prepared draft.
- A dev-only `AuthCallback?local=1&token=...` branch now stores local auth tokens only in `import.meta.env.DEV`; this was added because Browser Use cannot type into login fields when its virtual clipboard is unavailable.
- React StrictMode was aborting the first voice QA fetch during the dev-only effect cleanup and then blocking the retry through the same ref. The QA effect now uses request ids so cleanup/duplicate effects cannot leave a false `signal is aborted` result.
- The monthly analysis tab opened and showed the report trace in the UI: `route=report_request`, `tools=monthly_report.facts`, `facts=8`, `source=semantic_live`, `LLM=0`, `embed=0`, `risk=low`, and `nums 100%`.
- Direct free-text browser typing still fails at the Browser Use runtime layer on the chat textarea with `Browser Use virtual clipboard is not installed`.
- The E2E gap is now replaced with a dev-only QA prompt path: `/ai?ai_qa_prompt=<encoded prompt>&ai_qa_new=1`. It sends a real chat message through the mounted UI/runtime without using textarea typing.
- Browser QA prompt smoke for `فاكر موضوع القهوة والنوم؟` created a fresh chat and showed `ai-trace route=memory_question tools=memory.search retrieval=fireworks_qwen embedding=embedding:query_embedded, embedding:fireworks, embedding:rows:23 embeddingCalls=1 cache=memory risk=low`.
- Browser QA prompt smoke for `صرفت كام النهارده؟` created a fresh chat and showed `ai-trace route=finance_query tools=finance.summary retrieval=skipped embedding=none embeddingCalls=0 cache=memory risk=low`.
- Dashboard expense free-text QA is also covered without textarea typing through `/dashboard?tab=record&expense_qa_text=<encoded text>`. A browser smoke with `دفعت 1 جنيه قهوة qa_browser_...` drove the real `ai.parseExpense` path and rendered `parser-trace route=expense_parse tools=smart_pipeline, rule_engine parsedBy=rule_engine decision=auto_save llm=0 embedding=0 tokens=0 context=finance.summary risk=low`.
- The browser expense smoke created one real QA row, then cleanup removed it from `expenses` by its unique `raw_text` marker (`matched=1`, `deleted=1`).
- Monthly report comparison now has a browser QA path via `/ai?ai_tab=report&report_qa_month=2026-06&report_qa_compare_month=2026-05`.
- This QA uncovered a real cached-date bug: comparison failed with `summary.period.startDate.toISOString is not a function` when finance summaries came from cache. The router now formats `Date | string | number` period values safely.
- Browser report comparison retest now shows `compare-qa-status success:2026-06:2026-05` and `compare-ai-trace route=finance_period_comparison tools=finance.summary risk=low`, with UI details `LLM=0`, `embed=0`, `nums 100%`, `tokens total=157`, and deterministic comparison text.
- Structured chat responses are now versioned. A fresh browser QA response shows `schema=2` in `ai-trace`; after reload, an older saved memory conversation shows `schema=0 historical=true`, so QA can distinguish old stored artifacts/responses from freshly generated current-runtime output.

## Browser Retest - Semantic/Action Continuation

- Browser central-agent QA matrix covered finance, category evidence, chart, site guide, memory, mixed advice+memory, action draft/cancel, report traces, and voice permission UI. The matrix verified:
  - `صرفت كام النهارده؟` -> `finance.summary`, `retrieval=skipped`, `embedding=none`, `embeddingCalls=0`, `LLM 0`.
  - `صرفت كام أكل الشهر ده بالظبط؟ وهات العمليات اللي اتحسبت` -> `finance.category_total + finance.transactions`, `embedding=none`, `LLM 0`.
  - `ارسملي مصاريف الأكل آخر 6 شهور` -> `chart.data`, chart artifact with six visible `chart-point` rows, `embedding=none`, `LLM 0`.
  - `ازاي اربط الفيزا بالرسائل SMS؟` -> `site_guide.search`, `retrieval=static_local`, no action draft, `embedding=none`, `LLM 0`.
  - `فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟` -> `memory.search`, `retrieval=fireworks_qwen`, `embedding:fireworks`, `embeddingCalls=1`, `LLM 0`.
  - `اعمل لي خطة أظبط القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده بخطوات ذكية` -> `advice_request` with a small facts pack plus `memory.search`, `retrieval=fireworks_qwen`, `embeddingCalls=1`, and one LLM response.
  - `اربط كارت فيزا آخر 9876` -> `action_request`, wallet draft card with confirmation buttons, no execution before confirmation; browser cancellation changed the card state to `تم الإلغاء`.
- Browser confirmed-action QA executed a QA-only wallet draft for `اربط كارت فيزا آخر 8642 رصيد 9091`; DB verification found the wallet row, executed pending action, audit events, and action memory. The exact QA rows were then deleted and post-cleanup counts were zero.
- Confirmed-action QA exposed a trace-routing bug: direct card linking with an initial balance was shown as `finance_query`. `intent-router` now classifies direct site/card actions as `action_request` even when they include a balance, while `ازاي/كيف` help questions still route to `site_help`. Browser retest with `اربط كارت فيزا آخر 8643 رصيد 9092` showed `route=action_request`.
- The matrix exposed and fixed a trust issue in category evidence responses: the answer could say five operations were counted while listing only three examples. `transactionEvidenceLines` now defaults to five safe rows, and browser retest showed all five food transactions under the total.
- Direct semantic memory preference is now enforced in the shared `memory-retriever` selection itself, not only in chat response formatting. When a matching direct `memory` item exists, selected facts drop competing `capsule` summaries while preserving relevant `action` memories, so chat and voice use the same cleaned retrieval behavior.
- Browser retest after the retriever cleanup for `فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟` showed `route=memory_question`, `tools=memory.search`, `retrieval=fireworks_qwen`, `embedding=embedding:query_embedded, embedding:fireworks, embedding:rows:26`, `embeddingCalls=1`, `LLM 0`, and the visible answer contained only the direct coffee/sleep memory.
- Fireworks/Qwen itself was verified from runtime settings: `ai_memory_embedding_enabled=true`, model `accounts/fireworks/models/qwen3-embedding-8b`, memory dimensions `768`, and a live embedding smoke returned `fallback=false`, `vectorLength=768`.
- Browser memory QA for `فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟` now returns only the direct semantic memory about coffee/sleep and shows `route=memory_question`, `tools=memory.search`, `retrieval=fireworks_qwen`, `embedding:fireworks`, and `embeddingCalls=1`.
- The retest exposed memory pollution from old conversation capsules: generated finance/advice replies could compete with real semantic memories. The response layer now prefers direct `memory` evidence over capsule summaries, generated finance/advice text is treated as low-signal memory text, and `buildConversationCapsule` stores recall/advice prompts as `استعلام ذاكرة بدون ذكرى جديدة`.
- Mixed advice + memory prompts such as `اعمل لي خطة أظبط القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده بخطوات ذكية` now route as `advice_request` while still resolving `memory.search` with Fireworks/Qwen. If the LLM returns meta-reasoning or a truncated list, the response is replaced with grounded facts/memory content instead of leaking internal reasoning.
- Site-help QA for `ازاي اربط الفيزا بالرسائل SMS؟` now stays pure `site_help`: no wallet action draft is created, the answer uses `site_guide.search`, and the trace shows `retrieval=static_local`, `embedding=none`, `LLM=0`.
- Direct action QA for `اربط كارت فيزا آخر 4321` still creates a pending wallet draft with confirmation buttons, but now traces as `action_request` instead of misleading `site_help`.
- Chart QA for `ارسملي مصاريف الأكل آخر 6 شهور` shows prepared chart artifact data (`chart-point 2026-06 ٦٥٩٫٥ جنيه ٥ عملية`) with `route=chart_request`, `tools=chart.data`, `LLM=0`, and `embedding=0`.
- Follow-up browser QA after the voice confirmation-limit fix used the data-rich `Codex AI Tester` account instead of the exhausted free `Voice QA User`. Results:
  - `صرفت كام النهارده؟` -> `finance.summary`, `retrieval=skipped`, `embeddingCalls=0`, `embeddingApiStatus=skipped`, answer total `٢٬٣٣٧٫٥ جنيه` from `١١` expense operations.
  - `صرفت كام أكل الشهر ده بالظبط؟ وهات العمليات اللي اتحسبت` -> `finance.category_total + finance.transactions`, `embeddingCalls=0`, answer total `٦٥٩٫٥ جنيه` from `٥` operations.
  - `فاكر الخطة اللي اتكلمنا عنها عشان القهوة والنوم؟` -> `memory.search`, `retrieval=fireworks_qwen`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:26`, `embeddingCalls=1`, `embeddingApiStatus=fireworks_live_call`.
  - `ارسملي مصاريف الأكل آخر 6 شهور` -> `chart.data`, six visible `chart-point` rows, June point `٦٥٩٫٥ جنيه / ٥ عملية`, `embeddingCalls=0`.
  - `ازاي اربط الفيزا بالرسائل SMS؟` -> `site_guide.search`, `retrieval=static_local`, `embeddingCalls=0`.
- Follow-up browser voice QA on the same data-rich account verified:
  - `finance_query` -> `retrieval=skipped`, `embeddingCalls=0`, `embeddingApiStatus=skipped`.
  - `memory_search` -> `retrieval=fireworks_qwen`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:26`, `embeddingCalls=1`, `embeddingApiStatus=fireworks_live_call`.
  - `action_draft` -> `retrieval=skipped`, `embeddingCalls=0`, no execution before confirmation.
- QA environment gap found during this retest: the default `Voice QA User` free account hit the chatbot daily limit (`20` messages), so browser prompt QA produced the upgrade/limit message instead of AI traces until switching to a data-rich ultra/admin test account.
- This gap is now fixed for automated QA only: the dev-only `/ai?ai_qa_prompt=...` path sends `devQaBypassDailyLimit`, and `chat.sendMessage` honors it only outside production. Browser retest on the same exhausted free `Voice QA User` account returned `ai-trace route=finance_query ... embeddingCalls=0` with no daily-limit message.
- Dev QA path hardening now has source/behavior coverage:
  - chat QA prompt and `devQaBypassDailyLimit` are dev-only and ignored in production.
  - voice QA allows only `finance_query`, `memory_search`, and safe `action_draft`.
  - expense QA, report QA, and local-token callback are guarded by `import.meta.env.DEV`.
- Voice non-mic contract coverage now verifies the live WebSocket is wired to the shared `voice-kernel` (`VOICE_TOOL_DECLARATIONS`, hot context, system prompt, `executeVoiceTool`, prefetch, archive) and not legacy chat tools.
- Voice prompt coverage verifies: smallest matching tool first, no invented financial numbers, draft before explicit confirmation, and high-risk actions require UI confirmation.
- Redis production-like gate added: `npm run test:redis` runs a real Redis miss/hit/invalidation/status test. On this machine it currently fails with `ECONNREFUSED` because no Redis server is listening on `localhost:6379`; this is now an explicit environment prerequisite rather than an untested assumption.

## Full Suite Retest

- Full `npm test` initially exposed five non-AI-center regressions/gaps:
  - ambiguous category scoring returned only `متنوعات`.
  - `لعبت بلايستيشن ساعتين 80 جنيه` fell through to external AI because `80 جنيه` followed a duration word.
  - finance period tests were asserting user-facing labels instead of actual resolved dates.
- Fixes applied:
  - no-signal category scoring now falls back to the full category set.
  - explicit currency suffixes preserve small amounts even when the previous word is a duration.
  - period tests now assert `startDate/endDate` keys.
- Final full suite result after the voice max-tool guard, confirmation/cancel exemption, dev QA daily-limit bypass, QA path source guards, Redis integration gate, voice prompt contract, voice tool QA path, StrictMode fix, Redis-down cache guard, voice/memory retriever cleanup, evidence-row fix, voice-prefetch guard, and memory-cache over-invalidation fix: `59` test files passed, `1` skipped; `345` tests passed, `1` skipped.
- `npm run check` passed after the fixes, the action conversation-binding update, the structured site-guide tool update, the browser QA prompt replacement, and the centralized memory selection cleanup.
- Focused retest after the confirmation/cancel exemption: `npx vitest run api/services/voice-call-service.test.ts` passed `8` tests; full voice-focused suite passed `3` files / `14` tests before the full suite.
- Focused Redis/QA/voice hardening retest: `7` files passed, `1` skipped; `24` tests passed, `1` skipped. The skipped test is the real Redis integration gate unless `RUN_REDIS_INTEGRATION=1` is set. With `npm run test:redis`, it executed and failed correctly because Redis is not running locally.

## Remaining Gaps

- Browser automation still cannot type directly into free-text fields because the runtime virtual clipboard is unavailable; latest confirmed failures include Playwright `fill`, Browser clipboard paste, and CUA `type`.
- `/ai` free-text chat QA and dashboard expense free-text parser QA are no longer blocked by that runtime issue because dev-only query prompt paths now provide browser-verifiable replacements.
- Browser automation now verifies the monthly report trace and the monthly comparison trace through the report QA query path; direct typing/click flakiness remains a Browser Use limitation, but this flow is no longer unverified.
- Redis is still not running in this local machine, so local development cache uses the in-process RAM fallback. In production, the same missing Redis state reports `backend=disabled` and does not cache in RAM unless explicitly allowed. A real Redis integration gate now exists, and operational setup / expected trace checks are documented in `docs/AI_CENTER_REDIS_SETUP.md`.
- Existing saved conversations can still contain old artifact payloads, but they are now marked as historical in the trace when loaded from storage without a current response schema. They only need regeneration if we want their actual artifact payloads rewritten.
- Expense recording/classification and recorded-audio parsing still use `runSmartPipeline` as their classifier engine, but the highest-cost context issue is now removed. A future consolidation step can wrap this classifier behind a shared agent/tool trace contract if we want one runtime surface for every AI capability.
