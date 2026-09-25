# AI Center

The chat assistant in the AI Center: it plans every turn without a model, answers finance questions from the user's
own ledger, remembers what the user said across conversations, answers how-to questions from a built-in guide, and
drafts actions (a goal, an expense, a budget, a wallet change) that run only after the user confirms. A model is
called at most once per turn, only to word an analysis or advice, and the numbers in its reply are checked against the
facts.

- Facts generated from the code, with diagrams: [docs/atlas/systems/ai-center.md](../atlas/systems/ai-center.md)
- The same story for readers who do not read code: [docs/ar/systems/ai-center.md](../ar/systems/ai-center.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Page | `src/pages/AICenter.tsx#AICenter` | Three tabs kept mounted once opened: chat, the [live voice call](voice-calls.md) and the monthly analysis of [insights](insights.md) (`ai_tab` in the address). The call tab (`src/components/voice/VoiceCallTab.tsx`) picks a voice and starts the call |
| Chat screen | `src/components/ai/AIChatbot.tsx#AIChatbot` | Conversations, quick prompts, answers with artifacts (cards, tables, charts, quick replies), confirm and cancel buttons, the memory manager |
| Chat API | `api/chat-router.ts` (`chat.sendMessage` and the conversation, action and memory procedures) | Limits, conversation storage, the kernel call, action drafts, memory writes, cost records |
| Kernel | `api/services/ai-kernel/` | Intent routing, the turn plan, data needs, deterministic answers, the optional model call and its guards |
| Finance semantic layer | `api/services/finance-semantic-layer/` | Exact facts from the ledger, with period resolution and a per-user cache |
| AI memory | `api/services/ai-memory/` | Conversation capsules, extracted memories, optional embeddings, retrieval |
| Site guide | `api/services/site-guide/` | How-to answers from a fixed knowledge base |
| Action runtime | `api/services/action-runtime/` | Pending actions, confirmation, execution, undo, audit |

## One message, step by step

### 1. Limits and the conversation
`chat.sendMessage` reads its configuration from system settings (`loadChatConfig`). The chat must be enabled for the
plan (`chatbot_enabled_<plan>`), and the user's messages today must be under `chatbot_daily_limit_<plan>`, counted per
Cairo business day. The model is asked in this order (`chatModels`): the models the admin assigned to "chat" in the
console for the user's plan, then the older chatbot settings when they hold a key (`chatbot_api_key`, else
`fireworks_api_key`, with `chatbot_base_url` and `chatbot_model`, Fireworks and a DeepSeek model by default), then
Google's Gemini (the plan's default through Google's OpenAI-compatible endpoint); when one fails, the kernel asks the
next (`AIKernelActiveConfig.fallbacks`). The length of a model reply is capped by the
chat cost policy of [AI providers and usage limits](ai-platform.md), and the answer's model call is written to the
[AI cost ledger](ai-platform.md#how-a-call-is-recorded) at that model's price. The procedure then creates a conversation, or
checks that the given one belongs to the user (`requireOwnedConversation`), loads its latest messages
(`chatbot_max_history`) and stores the user's message.

When `ai_kernel_enabled` is `false`, steps 2 to 5 are skipped and every message gets a fixed reply saying the
assistant is paused.

### 2. A confirmation typed as text
When the message is a short confirmation or cancellation with no numbers ("موافق", "تمام نفذ", "الغي", "لا") and the
conversation has a pending action, `resolveTextActionReply` confirms or cancels the newest one through the action
runtime and answers without a model. A high-risk action is confirmed only by its phrase («أوقف الهدف», «تراجع عن
العملية»); a plain «تمام» gets an answer naming the phrase, and nothing runs.

### 3. The kernel plans the turn
`api/services/ai-kernel/index.ts#runAIKernelActive` loads the user's contacts, then
`api/services/ai-kernel/agent-planner.ts#planAgentTurn`:
- routes the intent with keyword rules (`api/services/ai-kernel/intent-router.ts#routeIntent`): a finance query or
  analysis, goal planning, an action, advice, a how-to question, a memory question, a report, a chart, an expense to
  record, small talk or unknown;
- matches a named person against the contacts;
- asks a clarifying question, with quick replies, when a required detail is missing: the intent is unknown, an
  expense or a goal has no amount, or the person is not a contact;
- chooses the mode: deterministic, or synthesis for advice, goal planning and "why" or "plan" questions, which
  allows one model call;
- compiles the data needs (`api/services/ai-kernel/data-need-compiler.ts#compileDataNeeds`), for example a summary
  for today, a category total, a period comparison with its drivers, transactions as evidence, a goal feasibility,
  a memory search or a guide search.

The capabilities the planner recognises, with their required details and action policies, are listed in
`api/services/ai-kernel/capability-registry.ts#CAPABILITIES`.

### 4. Facts
`resolveShadowFacts` resolves the data needs in parallel, and a failing source only adds an error:
- finance needs through `api/services/finance-semantic-layer/resolvers.ts#resolveKernelDataNeeds`: summaries, period
  comparisons and their drivers, category and person totals, breakdowns, transactions, a transaction lookup, the
  saved classification trace of an expense, category inclusion, business cash flow, goal progress and feasibility,
  the profile snapshot, wallet balances and chart data;
- memory needs through `api/services/ai-memory/memory-retriever.ts#retrieveMemoryContext`;
- guide needs through `api/services/site-guide/retriever.ts#searchSiteGuide`.

### 5. The answer
- Draft actions come from the facts (`proposedActionsFromFacts`): a new goal for goal planning, or recategorizing
  the expense a lookup found.
- `buildDeterministicContent` writes the Arabic answer from the facts for most questions: balances, totals,
  comparisons, breakdowns, goal progress, remembered points, guide steps, charts, and the confirmation text of a
  draft.
- The model is called only when the plan allows one call, a key exists and `shouldUseLLM` agrees: the question is an
  analysis, advice, goal plan, action, report or chart without a deterministic answer, or it asks why or for a plan.
  Explaining a saved classification never uses the model. `api/lib/deepseek-client.ts#callChatCompletionAPI` sends a
  short system prompt with a recipe for the answer's shape and the compacted facts, with no tools.
- Guards on a model reply: a number that does not appear in the facts replaces the reply with a safe message listing
  the confirmed numbers (`safeContentAfterUnsupportedNumbers`); advice that reads as the model's own reasoning or is
  cut off is replaced by an answer built from the facts.
- The response carries the facts, artifacts, draft actions and a debug trace (plan, cache hits, embedding status,
  numeric accuracy, hallucination risk), and `logAITrace` records the turn.

### 6. After the kernel
- A clarifying question is saved as a clarification state in the conversation's metadata (see known issues).
- A draft is stored as a pending action: the kernel's proposal, or one parsed from the message by
  `api/services/action-runtime/index.ts#maybeCreateActionDraftFromMessage`. The reply is reworded to say that nothing
  has run yet, or why the draft failed (for example the Free plan's goal limit).
- The assistant's message is stored with its structured response, the conversation is written to AI memory (awaited
  when it holds something worth remembering), the provider tokens are added to the user's usage, and a cost metric
  records model calls, embedding calls, tools and numeric accuracy.
- When the kernel throws, the reply is the same fixed "paused" message as when it is turned off.

## Actions
Actions are `goal.create`, `goal.update`, `goal.stop`, `expense.create`, `expense.recategorize`, `budget.create`,
`profile.update`, `wallet.create`, `wallet.update` and `action.undo`. A draft is validated
(`api/services/action-runtime/extended-actions.ts#validateRuntimeAction`), stored in `ai_pending_actions` with a
summary and an expiry, and shown as a confirmation card. A new goal respects the plan's active-goal limit
(`goals_active_limit_<plan>`, the same setting `goals.create` reads).

`api/services/action-runtime/index.ts#confirmAction` (the card's button, `chat.confirmAction`, or a typed
confirmation):
1. loads the action for this user, requires it to be pending, unexpired, and from the same conversation when one is
   given;
2. for a high-risk action (`goal.stop`, `action.undo`) requires the words its card shows — «أوقف الهدف», «تراجع عن
   العملية» — compared without hamza, spacing or punctuation, and refuses with `PRECONDITION_FAILED` and an audit row
   otherwise. The card keeps its button shut until they are typed; a typed «تمام» gets an answer naming them instead of
   running the action; the phrase typed in the chat confirms it. The server checks them whatever the channel;
3. moves it to `confirmed` in one conditional update, so a second confirmation fails instead of running twice;
4. executes it (`executeGoalCreate` or `executeRuntimeAction`), records the result, writes `ai_action_memory` and
   an audit row, and after a new goal drafts a matching budget;
5. on failure marks it `failed`. `cancelAction` marks it `cancelled`.

`action.undo` looks at the most recent executed actions and reverses the newest one that can be undone: creating,
changing or stopping a goal, recategorizing an expense, creating or changing a wallet, or a profile change.

An AI-recorded expense is inserted in a transaction with its details and daily rollup delta, then muscle memory and
the finance caches are cleared.

## Memory
- **Writing** (`api/services/ai-memory/memory-writer.ts#writeConversationMemory`), after every chat turn and at the
  end of a voice call: a capsule and a running summary per conversation in `ai_conversation_summaries`; up to five
  memories per turn, picked by word rules from the user's messages (preferences such as "بحب", commitments and limits
  such as "متنفذش غير لما أأكد" or a budget cap, interest in linking a card or bank messages, and an assistant plan the
  user agreed to) into `ai_memory_items`, deduplicated by content; and, unless `ai_memory_embedding_enabled` is
  `false`, a vector of each memory in `ai_memory_embeddings`, written in the background with the model that made it.
  Vectors come from `api/lib/embedding-provider.ts`: the providers the admin assigned to "embedding" in the console, in
  their priority order, then Google's `gemini-embedding-2` with each Gemini key (`ai_embedding_model` may name another
  Google model); a provider out of quota or failing rests for a minute (a quarter of an hour for a refused key) and the
  next answers. The `memory-embedding-backfill` job (every 20 minutes, in `api/boot.ts`) gives up to 40 memories a run
  the vector of the current model they lack, so changing the model fills in older memories without a burst.
- **Reading** (`retrieveMemoryContext`): cached for five minutes per user and query, and invalidated by a generation
  counter. It scores recent capsules, active memories and executed actions by words, importance and recency, and adds
  vector similarity from the stored embeddings only when embeddings are on and no strong word match was found, against
  the vectors of the model that embedded the question only. Query embeddings are cached in Redis for two weeks; with no
  provider answering, a local stand-in vector says so in the trace (`embedding:fallback:…`) and matches nothing stored.
- **Managing**: `chat.listMemories`, `chat.forgetMemory` and `chat.clearAllMemories`, behind the memory manager.
  Forgetting deletes the memory and its embedding; nothing is kept behind a status (migration
  `db/migrations/0024_purge_forgotten_memories.sql` removed the ones earlier versions kept as `forgotten`). The manager is
  `src/components/ai/AIMemoryManager.tsx`. `chat.listMemories` also says whether a memory came from a live call
  (`fromCall`, from its metadata, which does not leave the server otherwise); the manager labels a call's summary, a plan
  and an agreement. The [voice call](voice-calls.md) opens the same manager from its end screen.
  `chat.clearConversation` deletes a conversation's messages and summary; the memories taken from it stay until they
  are deleted.

## The finance semantic layer
- Periods (`api/services/finance-semantic-layer/period-resolver.ts#resolveFinancePeriod`): today, yesterday, this
  week, this month or salary cycle (from the salary day in the profile), last month, or custom dates. They are Cairo
  business days (`api/lib/app-time.ts`, golden rule 6) whatever timezone the server runs in: the calendar arithmetic
  happens on business days and only the boundaries become instants, and a custom "YYYY-MM-DD" is read as that
  business day. Chart buckets (`api/services/finance-semantic-layer/row-aggregators.ts`) and the dates of
  transactions in facts (`api/services/finance-semantic-layer/resolvers.ts`) use the same business day.
- Categories are matched through the category registry (`api/services/finance-semantic-layer/category-matcher.ts`).
  A category may be named as the user says it ("أكل", "المطاعم") or by its id (`food`): `financeCategoryId` turns
  the name into the registry's id before rows are compared, and a name the registry does not know matches nothing
  rather than the uncategorized rows; a group name sweeps its members (`financeCategoryIds`: "الدخل" every income
  category, "فواتير" bills and daily commitments). A question about income sweeps every income category (مرتب، عمل حر، عوائد استثمار، هدايا وعيديات، دخل آخر). A
  row counts under its stored category; its text is read only when it is stored as uncategorized or متنوعات
  (`canonicalCategoryForRow`).
- Spending is an expense row, as on Home (`isSpendingRow` in `api/services/finance-semantic-layer/row-aggregators.ts`):
  breakdowns, charts, comparison drivers and the business cash flow leave transfers (a gam3eya payment, a loan, an
  ATM withdrawal) and investments out.
- A period's totals (`getFinanceSummary`) are one SQL aggregate over `expenses`, so they hold for any number of
  entries. Breakdowns, lookups and category totals read the period's entries instead: only the columns they use, and
  the newest 10,000 at most (`ROW_LIMIT` in `api/services/finance-semantic-layer/resolvers.ts`). Both cover the
  personal ledger only, as Home does: an expense with a `business_id` belongs to that business.
- Results are cached per user (`api/services/finance-semantic-layer/cache.ts#withFinanceCache`): a minute for today,
  ten minutes for yesterday, an hour otherwise, a minute for wallet balances and five minutes for goals and the
  profile snapshot. After writing, the expense, receipt and bank-message routers, the budget, goal and business
  routers and the action runtime bump the user's generation (`invalidateFinanceUserCache`, also exported as
  `bumpFinanceCacheGen`), which drops these results and the expense caches. The keys also carry a schema version
  (`CACHE_SCHEMA_VERSION` in `api/services/finance-semantic-layer/cache.ts`, with the category taxonomy's version),
  raised whenever a result's shape or meaning changes, so a deploy never serves an older kind of result.
- The same layer serves the voice call's tools and prefetch, and the monthly report, month comparison and yearly
  summary of [insights](insights.md), including its WhatsApp monthly report job.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Which questions map to which intent | `api/services/ai-kernel/intent-router.ts` | `api/services/ai-kernel/intent-router.test.ts` |
| When to ask a question, and when a model may be called | `api/services/ai-kernel/agent-planner.ts`, `api/services/ai-kernel/capability-registry.ts`, `shouldUseLLM` in `api/services/ai-kernel/index.ts` | `api/services/ai-kernel/agent-planner.test.ts`, `api/services/ai-kernel/agent-golden-contract.test.ts` |
| Which facts an intent needs | `api/services/ai-kernel/data-need-compiler.ts` | `api/services/ai-kernel/phase2-resolution.test.ts` |
| How a fact is computed from the ledger | `api/services/finance-semantic-layer/resolvers.ts` and its helpers | `api/services/finance-semantic-layer/` tests |
| The wording of answers without a model | `buildDeterministicContent` in `api/services/ai-kernel/index.ts` | `api/services/ai-kernel/index.test.ts` |
| Which typed words confirm or cancel a draft | `actionReplyKind` in `api/chat-router.ts` | the chat router tests |
| The model, its key, limits and plans | the `chatbot_*` and `ai_kernel_enabled` system settings; the reply cap in [AI providers and usage limits](ai-platform.md) | |
| What is remembered and how it is found | `api/services/ai-memory/memory-writer.ts`, `api/services/ai-memory/memory-retriever.ts` | `api/services/ai-memory/` tests |
| How-to answers | `api/services/site-guide/knowledge-base.ts` | `api/services/site-guide/retriever.test.ts` |
| What an action does, and what undo can reverse | `api/services/action-runtime/extended-actions.ts`, `api/services/action-runtime/goal-create.ts` | `api/services/action-runtime/` tests |
| The chat screen | `src/components/ai/AIChatbot.tsx` | `tests/ai-chatbot-resilience.test.ts` |

`npm run qa:ai-center` runs `api/qa/ai-center-qa-runner.ts` against a seeded account (`npm run qa:seed`) and a real
database.

## Rules for changes here
1. Money numbers come from resolved facts. A model may word them, never produce them; keep the numeric guard.
2. An action is always a draft first and runs only through `confirmAction`; one that cannot be taken back gets a
   phrase in `api/services/action-runtime/confirmation-phrases.ts` and runs only when it is typed. Choosing an
   action's risk is part of adding it.
3. One model call per turn at most, and only when the plan says synthesis; deterministic answers cost nothing.
4. Everything reads and writes by `userId` and `userType`, including memory, contacts and pending actions.
5. A write to the ledger from here must bump the finance cache generation.
6. Never log a message, a memory or a draft (golden rule 10). A failed kernel call, draft, confirmation or memory
   write is logged as the error itself through `api/lib/log.ts`, never as `error.message` text: a failed write's
   message holds the user's words as the query's values, and only the error object can be written without them.

## Tests
`api/chat-router.phase0.test.ts` through `api/chat-router.phase9.test.ts`; the kernel tests in
`api/services/ai-kernel/` (`agent-contract`, `agent-golden-contract`, `agent-planner`, `index`, `intent-router`,
`phase2-resolution`, `phase3-memory`, `phase6-site-chart`); the tests in `api/services/ai-memory/`,
`api/services/finance-semantic-layer/`, `api/services/action-runtime/` and `api/services/site-guide/`;
`api/services/ai-center.creative-smoke.test.ts` and `tests/ai-chatbot-resilience.test.ts`.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** A reply to a clarifying question starts over: `sendMessage` stores the clarification state in the conversation's
   metadata, but reads it from `requireOwnedConversation`, which selects only the id, so the state is never found and
   the reply is planned as a new message.
2. **Bug.** A pending action expires 30 minutes after it is drafted plus the server's offset from UTC.
3. **Gap.** No AI budget is checked before the model call (`api/AGENTS.md`, rule 5): only the daily message count limits the
   chat. The model id skips `mapModelName` (golden rule 9), the `chatbot_max_tokens_<plan>` settings are read but do
   not limit replies, and the retry time in the daily-limit error is counted to the server's midnight.
4. **Debt.** The Qdrant, quantized on-disk and in-memory vector stores exported by `api/services/ai-memory/index.ts` are
   used only by tests, and embedding calls do not reach the AI cost ledger (the providers report no token counts; Google's
   free tier does not bill them).
5. **Bug.** An expense recorded by an action does not clear the classification cache or check budget alerts, as
   `expense.create` does.
6. **Bug.** Undo cannot reverse an expense or a budget that an action created: `findUndoTarget` in
   `api/services/action-runtime/extended-actions.ts` leaves them out, so the undo code for them is never reached.
7. **Bug.** When the kernel throws, the user sees the same message as when an operator turned the assistant off.
8. **Debt.** `runAIKernelShadow` in `api/services/ai-kernel/index.ts` has no caller.
9. **Gap.** A breakdown, lookup or category total over a period with more than 10,000 entries reads only the newest
   10,000 (`ROW_LIMIT` in `api/services/finance-semantic-layer/resolvers.ts`). Breakdowns and category totals mark
   it (`partial`) and the voice call says so; the chat does not yet. Only the period's totals are exact at any size.

## Related systems
- [Live voice assistant](voice-calls.md): uses the finance layer, memory and action runtime from a call.
- [Reports, insights and the smart profile](insights.md): the monthly analysis tab and the profile the kernel reads.
- [Money](money.md): the ledger, goals, budgets and wallets the facts and actions touch.
- [Recording spending](expense-capture.md): classification traces the kernel explains, and the typed entry flow.
- [AI providers and usage limits](ai-platform.md): the cost policy and cost metrics.
- [Server platform and data](platform.md): Redis, the settings cache and the storage classes of the chat tables.
