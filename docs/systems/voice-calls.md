# Live voice assistant

The live voice call: the app streams the user's voice over a WebSocket, the server bridges it to the Gemini Live
API with a short financial context and a set of tools, streams the assistant's voice back, enforces the plan's call
minutes, and keeps what the call should remember. It is open from Home and the AI Center to every user whose plan
has calls; the first call (`/api/voice/live`) was removed on 2026-09-25.

- Facts generated from the code, with diagrams: [docs/atlas/systems/voice-calls.md](../atlas/systems/voice-calls.md)
- The same story for readers who do not read code: [docs/ar/systems/voice-calls.md](../ar/systems/voice-calls.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| App side | `src/lib/voice/`, `src/components/voice/` | One call for the whole app: capture with speech detection, playback, the socket client, the call screen and its ways in |
| Server side | `api/voice-router.ts`, `api/services/voice/`, `api/services/entitlements/voice.ts` | Who may call, the ticket, the `/api/voice/v2` socket, the Gemini Live engine, the brain and its tools |
| Admin | `src/components/admin/settings/AdminVoiceCallSection.tsx`, `voice.adminStats` | Kill switch, models, cost caps, the calls dashboard |

## The call

### Who may call
`api/services/entitlements/voice.ts#getVoiceEntitlements` returns one typed object: whether the plan may call
(`voice_call_enabled_<plan>`), minutes a month (`voice_call_limit_<plan>`), seconds a call
(`voice_call_duration_<plan>`), the model (`voice_v2_model_<plan>`, else `voice_v2_model`, default
`gemini-3.8-live`), the thinking level for the extended-thinking model, a daily provider-cost cap in USD
(`voice_daily_cost_cap_usd_<plan>`), whether the user gets [the coach call](#the-coach-call) (`coach`), and
[Ultra Thinking](#ultra-thinking) (`ultra`: its model and level, or null when not offered);
`voice_v2_kill_switch` stops every call and hides the ways in. Usage is the
Cairo month's `voice_calls.billed_seconds` plus any `voice_usage` rows (source `gemini_voice_call`) the removed
first call wrote that month, never dictation seconds.

### One call, step by step
1. `voice.startCall` (`api/voice-router.ts`, `api/services/voice/gateway/start-call.ts#startVoiceCall`) checks the
   entitlements, twelve starts per ten minutes per user, and that Redis (or the development memory fallback) can hold
   call state; closes the user's calls a crashed server left open (`closeAbandonedCalls`); takes a seat for the call
   (`api/services/voice/gateway/admission.ts#admitCall`); writes the `voice_calls` row; and returns a ticket that opens
   one call within 60 seconds. Google's limits are per project and per model, so the seats are one pool per model
   across all servers, capped by `voice_max_concurrent_calls` (standard model) and `voice_ultra_max_concurrent_calls`
   (extended-thinking model), plus `voice_max_calls_per_user` live calls per user (the id and type together); 0 means
   no cap. Seats live in Redis (a Lua step each), expire after 60 seconds unless the call renews them at its
   checkpoints, and go back when the call ends. An explicit quota refusal from Google trips a breaker for that model:
   new calls on it wait a minute, doubling with each trip in the hour up to thirty minutes, while live calls keep their
   seats. A full pool, a second call of the same user and a paused model each get their own Egyptian message. `voice.eligibility` tells the app
   which call to show and the minutes left; `voice.listCalls` lists the user's recent calls.
2. The app opens `/api/voice/v2` (`createVoiceUpgradeHandler` in `api/services/voice/gateway/index.ts`, called from
   the `upgrade` listeners of `api/boot.ts` and `api/server.ts`; allowed origins only, 64 KB frames) and sends
   `hello` with the ticket (`contracts/voice-protocol.ts`). The session token never travels in the URL.
   In full-stack development, `vite.config.ts` installs `scripts/vite-voice.ts#voiceDevServer` on Vite's HTTP
   server: Hono's development plugin handles HTTP requests only. The voice plugin loads the gateway, app-call
   adapter and router through Vite's SSR module graph, sharing the ticket store with `voice.startCall`. It keeps
   the same origin and exact-path checks, leaves Vite's HMR socket alone, and returns HTTP 503 if the modules
   cannot load. Frontend-only mode uses the existing WebSocket proxy to the standalone API instead.
3. `api/services/voice/gateway/call-session.ts#CallSession` builds the call's brain
   (`api/services/voice/brain/index.ts#createCallBrain`): the snapshot (`api/services/voice/brain/snapshot.ts`: the Cairo day, name and a
   title from the profession (`api/services/voice/brain/honorific.ts`), today's and the salary cycle's spending, days to payday, the last
   recorded day, one observation, what is remembered about the user (`memoryBrief`: up to five things they said, each
   with its day, slotted ones first; up to two follow-ups left open; up to two offers they declined; the last call's
   summary; expired ones left out), and the next profile question the app has no answer
   to, from `api/services/voice/brain/profile-questions.ts`, unless the app asked one in the last day; offering one
   starts that day's pause, `user_profiles.last_asked_at`, which the Home card shares), the instructions
   (`api/services/voice/brain/instructions.ts`, kept short because they are billed every turn) and nine tools. It connects the engine
   (`api/services/voice/engine/gemini-live.ts#GeminiLiveEngine`): input and output transcription on, session
   resumption, a context window of 16k tokens trimmed to 8k, tools NON_BLOCKING, the key in a header, and the second
   key when the first cannot open a session — except for a quota refusal (a close reason or error naming quota or
   RESOURCE_EXHAUSTED, or HTTP 429), which is never retried on another key: limits are per project, and spreading one
   workload over projects to get round a quota is not the app's to do — and Google's own end-of-turn detection set to
   wait a full second. Then it
   sends `ready` (with a resume token, the mode and whether Ultra Thinking is offered) and an opening note that makes
   the model greet without numbers. A fresh session that continues a call (a switch of mode) is given the call's last
   lines first as history (`EngineSetup#history`), which the model does not answer.
4. The app sends 16 kHz PCM only while the user speaks and `speech_end` when they stop, which the engine turns into
   `audioStreamEnd` so the model answers without waiting for silence. The model's 24 kHz audio, live captions,
   the state (listening, thinking, speaking, awaiting confirmation) and cards come back. Captions are shown, never
   stored. The state follows the work, not a timer: from a tool call it stays "thinking" while any tool of the call
   runs, and once the last answer is in the standard model has 8 seconds to start speaking; the extended model is never nudged while it reports IN_PROGRESS (its 16-second check waits for that state to end);
   a model still silent then is told once per request to give the answer now (`CallBrain#replyNudge`), and only a second
   silence sends the screen back to listening; each silence is a `no_reply_after_tool` incident. The extended-thinking model reports its
   task apart from its speech (`interactionStatus`): the engine turns IN_PROGRESS into `working` and IDLE into `idle`,
   so a spoken filler line ends in "thinking", and only IDLE returns to "listening"; `turn_complete` says whether the
   utterance ended while the model is still IN_PROGRESS. Each tool answer goes back to the
   model the moment it is ready (`CallSession#runTools`), after verifying shared call ownership, never held behind a slower one. A read whose user spoke again
   while it ran carries `earlier_request` ("this answers the request before the user's latest words"): without it both
   Live models took a balance read as the answer to the question that replaced it. The state carries what the call is waiting on
   (`VoiceWaitDetail`: records, a report, memory, a calculation, a price, the guide, a draft), named by
   `waitDetail` in the brain from the tools called, so the screen can say "بيراجع حساباتك…" or "بيجيب السعر…".
   Each tool call is logged with its name, how long it took, whether it answered and a refusal's short code
   (`voice.tool`), never its arguments or its answer. A tool that outlasts 12 seconds is stopped and answers an error,
   except a write (`confirm`, `CallBrain#writes`): its write may still land, so the model hears `still_running` and
   the outcome follows as a note once known (`tool_slow_write` incident).
   Notes from the app to the model (a tap on a card, the time warning, a write's late outcome) are complete user
   turns, which the provider treats as an interruption, so `CallSession#sendNote` holds them until the model is idle;
   only a correction of what is being said (a wrong number, "done" before consent) interrupts at once.
5. A dropped app does not end the call: the engine is closed with its resumption handle kept, the state goes to
   Redis, and for 45 seconds a `hello` with the resume token continues the call on any server, which reconnects the
   engine on the handle (or a fresh session with the last turns in its note). A server that lost a call to another
   does not end it. A GoAway from Google moves the engine to a new connection on its own, after any tool answer
   still owed on the old one.
6. The call ends on the user's `end`, the time limit (a warning a minute before, and 30 seconds more when a draft
   waits for an answer), the daily cost cap, 150 seconds of silence, the provider, or the network. The final row is
   written, the words go to Redis for an hour for the post-call summary and are never written to MySQL, and the app
   gets the end card: what was done, what was not. Then the words are summarized into the AI memory
   ([after the call](#after-the-call)).

### The coach call
A second profile of the same call, for the users the admin chooses: those on `voice_coach_allowlist` ("local:12,
oauth:7", the account type and id together) and the share `voice_coach_rollout_percent` of the others, placed by a
stable hash of the user (`api/services/entitlements/voice.ts#coachBucket`), so raising the percent keeps everyone who
had it. Nobody gets it by default. A coach call talks on the plan's model like any other call; the ticket and the
call's state carry `coach`.

Its brain (`createCallBrain` with `coach`) has its own instructions
(`api/services/voice/brain/coach-instructions.ts#buildCoachInstruction`: understand the need behind everyday
words, keep the thread, one question that changes the advice, the coaching path from goal to one agreed step, the
meanings not to mix — income and balance, left this month and available today, capacity and savings — and the
consent rules) and its own tools (`COACH_TOOLS`): no `think`, and `calculate` for every sum. A shorter candidate of
the same rules (`buildCoachInstruction` with `variant: "lean"`, about half the length) exists for evaluation only:
the whole context is re-read on every model step, so the instruction's length is the call's main cost and quota driver;
it is chosen by `CallOptions#instructionVariant`, which nothing sets for users. The facts in its opening
context and in every tool answer carry a ref ("f12") that `calculate` takes.

The coach also follows up (`api/services/voice/brain/tools/coach.ts`, on the services of
[commitments and plans](money.md#commitments-and-plans)): its `money_query` (`moneyQueryCoach`) adds `commitments`
(what is due and free until payday, expected income apart, every unknown named) and `plan` (the accepted plan, each
spending step's daily figure since it was agreed against its target, and the days with nothing recorded, said as
possibly unrecorded rather than kept); its `change_draft` (`changeDraftCoachTool`) adds `plan_save`, `step_done`,
`reminder_set` (a future day and hour on Cairo's clock), `reminder_cancel`, `commitment_add` (no date unless the user
gave one; money owed on a date, "لازم أرجع لخالد التمنمية يوم 15", is offered here as kind `debt`, once, rather
than kept as a memory; an incomplete one is refused with the fields to send, one date with no repetition being
`once`, so the model asks the user only what they never said), `commitment_paid`, and `bank_confirm` / `bank_dismiss` (a waiting bank message confirmed or dropped as it
is, through `profile.confirmSmsSuggestion` and `profile.dismissSmsSuggestion`; one already handled says so), and
`budget_update` (a budget's new monthly limit, an amount the user said, or pausing and resuming it, through
`budget.update`; `money_query budgets` gives each budget's id and lists paused ones apart; in a coach call a
`budget_create` for a category that already has a budget, or one whose words could not be read while budgets exist, is
refused with those budgets and their ids so the change goes through `budget_update` instead of adding a second one). They are drafts of kind `coach` behind the same gate; an amount in one must be a fact
the call read or computed or a number the user said, and a plan keeps the facts it was agreed on. The standard call
refuses both reads and drafts (`ToolContext#coach`).

### Ultra Thinking
"تفكير أعمق" is a mode a coach user can switch the call into from the call screen, where the admin enabled it for the
plan (`voice_ultra_enabled_<plan>`, off by default). It runs the coach on `voice_coach_model` (default
`gemini-3.8-live-extended-thinking`) at `voice_coach_thinking_level` (default `low`: the level being qualified, see
decision 0017) with an Ultra section in the instructions: read everything that bears on the question first, work out
two or three options with `calculate`, then speak a short recommendation and offer the details. In the standard mode
the coach may suggest the switch once for a question that needs a full plan. The mode is the product's, not Google's
tier and not the admin role.

`voice.startCall` takes the mode the app asks for (the one the user chose last) and starts in it only when it is
offered; the ticket carries both modes' models (`TicketPayload#modes`). A switch during the call
(`{type:"mode"}` from the app, `CallSession#switchMode`) refuses while a tool, unresolved write or pending confirmation exists, takes a seat in the new
model's pool (a quota pause refuses it), closes the provider session and opens a fresh one on the new model with the
call's last lines as history (`historyConfig.initialHistoryInClientContent`, at most 16 lines and 6,000 characters),
then a note makes the model continue without greeting. Drafts, facts, consent and the meter are the server's and carry
over; the old model's seat goes back. If the new model cannot connect, the call reconnects the mode it was in and
says so ("مقدرتش أشغّل التفكير الأعمق دلوقتي، فكملنا عادي") — the model never changes silently. The app hears
`mode` messages (`switching`, `active`, `refused` with why), and `ready` says the mode and whether Ultra is offered.

### The tools
| Tool | What it does |
| --- | --- |
| `money_query` | Any figure from the finance semantic layer, one call per question (a period of "this month" is the salary cycle when there is a payday, and is named so): totals (by category; for a person, whatever the metric asked, everything at once: what came from them as income, what
was paid to them, and the loan standing with them from the debts ledger, said as a loan, never as income; a name that matches no one comes back with the names that are recorded, so a
transliterated «Khaled» is asked again as «خالد» instead of being answered as nobody; everything
spent at a shop over the whole period), where the money went, a comparison with the same number of days of the previous period (of the named category when there is one; the period the model sends is the one asked about, so "الشهر ده أكتر من اللي فات؟" is this month, which the evaluation once got as last month) and which categories drove it, the latest transactions, why one transaction got its category (found by a word from it, a category or its amount, each a filter over the whole period), what a category counts, a month's report already written (below), whether an amount is affordable (the month so far, said as a shortfall when spending passed income, the wallet total and the active goals, for `think` to judge), wallet balances (each with the day the user entered it, or "unknown" for one saved before that was kept; said to be as entered, not a live statement), budgets (`budget.list`, cached a minute and dropped by any budget or expense write), goals, the entries still waiting for the user's answer (below) with, apart, the bank messages waiting for review (`profile.getSmsSuggestions`: never recorded again from words, so never twice; unreadable is said as unreadable, not as none), and, through the procedures of their screens, debts and the gam3eya (`expense.getDebtBalances`: each person's balance and the gam3eya's paid, received and installments, with a note that it rests on the loans recorded as transfers, has no due dates, and adds several gam3eyas together), installment plans (`expense.listInstallmentPlans`, with a note on how payments are counted: linked to due dates, or by the plan's word) and a season's spending (`expense.getSeasonSpending`). With `scope: business` the totals, breakdowns, comparisons, drivers, transactions, why and includes read the user's business's own ledger instead (`business.get`, behind its plan feature: no business and a plan without businesses are each said plainly; balances, budgets, goals, debts and the rest are the person's and refuse that scope), and the period label names the business so its figures are never taken for the person's. Every fact carries a ref for `calculate`. Before each read the tool compares the user's ledger generation with the one the call last saw: moved without a write of the call's own (a bank message, another device), every earlier figure is marked out of date and the answer says so (`records_changed`). Looking up a transaction searches the last 90 days unless a period is named. Categories are said in Arabic. A period too busy to read in full (more than 10,000 entries) is said to be counted in part. Each result carries the facts with their spoken form, a note on missing data, and a card |
| `record_draft` | Parses what the user says they spent or received through `ai.parseExpense`, checks the amounts against what the model understood and against the numbers heard from the user, and drafts; a disagreement asks about that number alone ("خمستاشر ولا خمسين؟"), except when the words carry a number the user
never said while every amount the model understood is one they did: the model misquoted them, so it is sent back to
resend their own words instead of asking the user (`needs: "user_words"`). Each item keeps what the parser found beyond its category, through the same helpers as the expense form (`contracts/expense-save.ts`): a refund's direction (saved negative in its category, and shown as "مرتجع"), a loan's or gam3eya's way, the person beside a purpose. A draft mixing kinds (spending and a refund) has no single total. With a `clarification_id` it finishes an entry left waiting: the words the user first typed, read from the database, with their answer in brackets, joined as `expense.answerClarification` joins them; the numbers of those first words count as heard from the user, and the entry is closed only when that draft is confirmed |
| `change_draft` | Drafts a goal, budget, wallet, profile detail (never age or gender) or recategorization through the action runtime, or undoing what this call recorded. The runtime's pending action is created with the draft, so every confirmation runs that one id; cancelling the draft cancels it |
| `confirm` / `cancel` | Executes or drops a draft through the gate below; an executed write marks every figure read before it out of date and tells the model so (`records_changed`); expenses are saved with `expense.batchCreate` with `clientRequestId` `vc:<call>:<draft>:<n>`, so a retry never saves twice; an action runs through `confirmAction` with `suggestFollowUp: false`, so no budget draft is left that the call cannot show |
| `memory` | Searches the AI memory, remembers what the user asks it to (never age or gender; a fact with an amount is kept as a note the tool tells the model counts nowhere and must not be called recorded, and in the coach it points to `commitment_add`), deletes a memory by id when asked to forget it (and hands its text to the post-call summary to leave out, see [after the call](#after-the-call)), lists what the app knows when asked ("إنت عارف عني إيه": job, payday, income, goal, monthly debt payment, the eight latest memories, and the screen where they can be seen and deleted), and saves the answer to the call's profile question, or its refusal, through `profile.submitOnboardingAnswer` once the answer fits the question's type |
| `app_help` | Steps from the site guide, or says the guide has nothing, with what the call can and cannot do: the coach can keep plans, in-app reminders and commitments, the standard call cannot, and neither sends anything outside the app |
| `calculate` | The coach call's arithmetic (`api/services/voice/brain/tools/calculate.ts`): steps of add, sub, mul, div, sum, min, max, pct and round over fact refs, earlier steps, counts ("12 months", "30 days"), percents, and amounts only when the user said them or a fact the call read holds that exact amount. Decimal arithmetic with units: pounds with pounds, pounds times days or months or a count, pounds over days is pounds a day, pounds times pounds refused. Each result becomes a fact the call may say, with how it was made; one built on a figure that went out of date is out of date too. Nothing is written when a step fails |
| `think` | The standard call only. Hard questions go to a text model through `executeAiGateway` with the user's numbers: `voice_think_model` (default `gemini-3.5-flash-lite`, fast because the caller is waiting), then the next model of the chain after 5 seconds, and 9 seconds in all. Numbers it returns survive only if they come from the data, from the user, or one step of arithmetic on them (a product only with a count on one side); a verdict, alternative or missing fact carrying any other amount is dropped whole. This is a plausibility screen, not a check of meaning |
| `market_price` | Gold or currency prices in Egypt from a text model with Google Search (`voice_price_model`, default `gemini-3.5-flash-lite`, through `askTextModel` with the same 5- and 9-second limits and the chain's other models), within sane bounds, cached 30 minutes for everyone. A price counts only when Google Search grounded it on a page: its source is that page (and its address, linked on the card), never a name the model wrote, and its time is when it was looked up on Cairo's clock; ungrounded, the call says it has no price |

The tools reach the app through `api/services/voice/app-calls.ts#createVoiceAppCalls`, which calls the app's own
tRPC procedures as the user, so a spoken expense is parsed, saved and undone exactly like a typed one.

What was already written is read, not worked out again. A month's report (last month unless one is named) is the
month's figures and three largest categories from the finance layer, plus the report the app stored for that month:
`api/services/voice/brain/tools/reports.ts#readStoredReport` takes the AI report of the analysis tab (`ai_summaries`,
period `monthly`), else the month-end job's `monthly_reports` row, and hands the call its first three points (140
characters each, without markdown) with the Cairo date it was written; numbers the report states may be said back.
A month without one says so. The same file reads the entries waiting for the user's answer in `pending_clarifications`
(the question and the words first typed, newest first), the same ones the Home card
`src/components/expenses/PendingQuestionsCard.tsx` shows, so the call can offer to finish one through `record_draft`.
Finance answers come from the finance layer's per-user Redis cache when it holds them (see the
[AI Center](ai-center.md#the-finance-semantic-layer)); every result is kept to a few facts because the live model
is billed again for it on every later turn.

### The checks
- **Numbers said.** `api/services/voice/brain/validator.ts` reads the numbers in the assistant's transcribed speech
  with `api/lib/arabic-number-parser.ts`. A money number that matches no fact of the call
  (`api/services/voice/brain/facts.ts`), no rounding of one and nothing the user said is recorded as a
  `spoken_number_mismatch` incident; when the latest tool answer holds the fact it was meant to be, a note makes the
  model correct itself at once (at most once a turn and three times a call). The fact it was meant to be must have the
  same number of digits and be at most twice or half the number said, or be its teen-and-tens twin (15 and 50, heard
  alike), so a number is never "corrected" into an unrelated figure. Numbers in the remembered things the call starts
  with, and the income and debt payment `memory list` reads, count as the user's own. Piasters are the fraction of the
  pounds before them ("خمسمية تلاتة وخمسين جنيه وتلاتة وتلاتين قرش" is 553.33), never an amount of their own. Amounts are spoken as `api/services/voice/brain/spoken.ts` writes them
  ("تمن آلاف وربعمية", "حوالي خمستاشر ألف").
- **Writes.** `api/services/voice/brain/drafts.ts#DraftBook`: only the latest pending draft, within two minutes, and
  only after a tap on its card or the user's own yes said after the assistant presented it (its first words after the
  draft was made). `readReply` reads the reply with a "no" first: a negation (also wrapped around the verb,
  "ماتسجلش"), a change, a new number, a condition ("لو"), a reservation ("بس"), only understanding ("بفهم"),
  someone else's words ("قال"), a question or "later" wins over any yes it comes with; "الغيها" is a yes only to an
  undo, and "غيّرها", "عدّلها", "خليها" are a yes only to a draft marked `edits` (a budget's limit or pause, and the
  `*.update` actions), where they agree with the change being read out — a "no" or a number other than the draft's
  still wins; a yes with more than three other words is asked again. User words after the assistant spoke are a new
  utterance, never the tail of an earlier one. Passing the gate claims the draft (`executing`), so a tap and a yes
  arriving together run it once; a claim whose write never started (the call stopped it) is released.
- **Out-of-date figures.** A number said that the call knows only from facts read before the records changed is recorded
  as a `stale_number` incident (not corrected: it was true when read, and the model was told the records changed).
- **The app's notes.** Every note the app sends the model is tagged with the call's own mark
  (`CallBrain#appNote`, "ملاحظة من التطبيق #a1b2c3"), which the instructions name as the only sign of a note from the
  app; the mark is never sent to the app or spoken, so words the user types or says claiming to be from the app are
  taken as theirs.
- **A lost step.** On the extended-thinking model, `api/services/voice/gateway/lost-call-guard.ts#LostToolCallGuard`:
  every utterance that continues a task (it starts after an utterance ended IN_PROGRESS, or after a dropped apology)
  has its audio and words held for up to 0.9 seconds (or until 28 characters show what it is); a request's first
  utterance is never held. If they claim a failure while no tool of the request failed
  (`api/services/voice/brain/claims.ts#claimsFailure`), they are dropped unheard and unshown, a `lost_tool_call`
  incident is recorded (with whether tools had answered), and a note asks the model to call the tool again (none was
  called) or to answer from the results it has (they came back), without apologising; after two retries in one request
  the note asks it to say plainly that it cannot reach that information in this call. Only the first suppressed text chunk triggers recovery; later chunks are suppressed without another note. The final inability answer is allowed. Transcript-first and audio-first continuations both enter the bounded hold. Anything else held is released
  at once, in order. The standard model is never held.
- **Claiming a failure.** `api/services/voice/brain/claims.ts#FailureClaimCheck`: a reply that says something broke
  ("حصل عطل", "مشكلة في النظام", "مش قادر أوصل") while no tool of the user's latest request failed is a
  `failure_claim_without_tool` incident (with how many tools that request called); twice a call, a note tells the
  model no tool failed and to call it again.
- **Saying the wrong amount was written.** `api/services/voice/brain/claims.ts#WrittenAmountCheck`: right after an
  expense write and before the user speaks, an amount of a replaced draft (a "15" corrected to "50") said as written is
  a `wrong_amount_after_write` incident, and a note makes the model say what was written (twice a call at most; after
  that the incident only).
- **Saying it is done.** `api/services/voice/brain/claims.ts#DoneClaimCheck`: while a new record or action waits
  for consent, a reply that calls it recorded or done ("سجلت", "اتسجل", "اتعمل") gets a note at once that makes the
  model say it is still waiting and ask, once a request and three times a call at most (a model that reads a draft
  back as "سجلت … أسجلها؟" was stopped and restarted 28 times in one evaluation call); the
  `done_claim_before_confirm` incident records that it happened and whether it was corrected.
  An undo draft is left out, because it speaks of what was recorded before.
- **Cost.** `api/services/voice/gateway/pricing.ts` prices the provider's token counts (Google's published Live
  rates) and the text models the tools ask (`textModelCostUsd`: `think`, a price lookup, which a cached price skips;
  thinking tokens count as output). A tool returns its cost, which joins the call's total and its daily cap
  (`toolCostUsd` in the metrics); the post-call summary's cost is kept with its tokens. The [AI cost ledger](ai-platform.md#how-a-call-is-recorded) gets the live
  session when the call ends (`channel` `voice_call`, priced by modality), and `think`, each price lookup and the
  summary on their own rows. The call's cost and tokens are checkpointed every 15 seconds with the billed seconds and first-audio
  latency (`voice_calls.metrics`).

### After the call
`api/services/voice/post-call.ts#summarizeCall` runs as soon as a call ends, on the server that ran it
(`createVoiceGateway` in `api/services/voice/gateway/index.ts`). It claims the call (`memory_status` from
`pending` to `writing`, so two servers never both do it), reads the words from Redis, and, when the user said more
than a few words, asks a text model once for a summary of at most two sentences and at most six things to remember
(plans, agreements, preferences, stable facts, offers the user declined, things to pick up next call), with the
user's 30 latest live memories, their slots and days, so it does not repeat them and can name one a new fact replaces.
Each thing may carry a slot from a closed registry (`api/services/ai-memory/slots.ts`: `income.payday`,
`housing.rent`, `preference.detail`, `goal:<topic>`, `refusal:<topic>`, `followup:<topic>`, …): a new value of a
slot replaces whatever held it, a declined offer is kept for 30 days and a follow-up for 21 so they stop counting on
their own, and the model may close a follow-up the call settled (`closes`). What the user forgot during the call, or from the memory screen while the summary was
pending, travels with the words as `forgotten` lines (`api/services/voice/gateway/store.ts#appendForgotten`, the
same Redis hour as the words, never MySQL): the model reads it as FORGOTTEN, the words it came from stay in the call
text, and `repeatsForgotten` drops any fact or summary sharing most of its words; the forgotten items are read again
just before writing, and words gone by then (the user forgot everything) mean nothing is written.
`readCallMemory` holds the answer to the rules whatever the model wrote: at most six
facts, only known ids replaced, only registered slots (a refusal or follow-up slot sets the type), only known
follow-ups closed, and nothing about age, gender, health, religion or a judgment of the person
(`api/services/voice/brain/never-kept.ts`). The summary is written to `ai_memory_items` as a `summary` ("مكالمة 23/9:
…"), the facts under their own types, both with `metadata.source` `voice_call`, the call id and the day, and a fact's
slot and end in `metadata.slot` and `metadata.validUntil`; a replaced memory becomes `replaced`, a closed follow-up
`done`. In the call, `memory remember` takes the same slots, so "افتكر إن مرتبي بقى يوم 27" replaces the old payday. Then the words are deleted and the call's `memory_status` becomes `saved` (or `empty`), with the
model and tokens in `voice_calls.metrics.memory`. A failure leaves the words for another try; after three the words are
dropped and the status is `failed`. The `voice-call-memory` job (every ten minutes, in `api/boot.ts`) tries again the
calls still pending and marks `expired` those whose words are gone after an hour.

The model is `voice_memory_model` (default `gemini-3.8-flash`), called directly through
`api/services/voice/text-model.ts#askTextModel` with the call's keys, then the other models of the shared chain
(`api/lib/model-mapper.ts#geminiFallbackChain`: `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`) when it is
overloaded or does not answer in time (Google answers 503 during demand spikes). It does not use the AI gateway's
routes. The next call's snapshot reads these memories, and the memory screen labels a call's summary
"ملخص مكالمة"; the end screen of a call opens that screen.

### In the app
- **Ways in.** While the plan has calls and the admin has not stopped them (`voice.eligibility` says `available`), users get a "كلّم سمارت" button on Home
  (`src/components/voice/CallSmartButton.tsx#CallSmartButton`, with the minutes left) and, in the AI Center's call
  tab, a screen to pick one of four voices and start (`src/components/voice/VoiceCallTab.tsx`,
  `src/components/voice/CallSmartButton.tsx#VoiceCallLauncher`). The first call opens with four lines
  on what the call is and what is kept.
- **One call for the whole app.** `src/lib/voice/call-store.ts#voiceCall` holds the call;
  `src/components/voice/VoiceCallHost.tsx`, mounted in `src/App.tsx` for signed-in users, shows it on every page.
  Shrinking the call (or the phone's Back button) turns it into a bar at the top of the app while the user moves
  around; a guide card's button opens its screen and shrinks the call. The audio and socket code
  (`src/lib/voice/call-controller.ts`) and the call screen load only when a call starts, and are fetched ahead of time
  while a call button is on screen.
- **The tap.** Browsers start sound and open the microphone only from a user's tap, so the tap itself creates the
  AudioContext and asks for the microphone (echo cancellation, noise suppression, automatic gain) in
  `src/lib/voice/audio-io.ts#primeCallAudio`, in parallel with `voice.startCall`. On iOS the page asks for the
  play-and-record audio session so the voice comes from the speaker. The screen stays on for the call (Wake Lock).
- **Hearing the user.** A worklet served from the app's own origin (`public/voice/capture-worklet.js`, because the
  page's Content-Security-Policy blocks worklets built from `blob:` URLs) hands 20 ms blocks to
  `src/lib/voice/downsampler.ts#Downsampler`, which filters out everything above 7 kHz before going down to 16 kHz so
  the hiss of "س" and "ش" does not fold into the band the recognizer hears. `src/lib/voice/speech-detector.ts#SpeechDetector`
  sends audio only while the user speaks: 300 ms from before the first syllable, pauses inside a sentence up to
  200 ms, and `speech_end` after 450 ms of silence for a short answer or 700 ms after a longer sentence. Its noise
  floor is the quietest frame of the last three seconds. While the assistant talks, interrupting it takes a louder
  voice held for 100 ms, so its own voice from the speaker does not cut it off; the assistant's voice drops at once
  and stops when the server says `interrupted`. Google's own end-of-turn detection waits a full second
  (`realtimeInputConfig` in the engine's setup), so the app decides when a turn ends.
- **The assistant's voice.** `src/lib/voice/pcm-player.ts#PcmPlayer` plays the 24 kHz chunks back to back after a
  120 ms cushion, which grows by 40 ms (up to 300 ms) each time a reply runs dry.
- **The line.** `src/lib/voice/call-connection.ts#CallConnection` sends `hello` with the ticket, pings every
  10 seconds and treats 25 silent seconds as a dead line. When the line drops it tries again at once, then after 1,
  2, 3 and 5 seconds, and immediately when the network or the app comes back, with the resume token of the latest
  `ready`, for up to 42 seconds (a little under the server's hold). On the server a socket that sends nothing for
  45 seconds is closed, which stops the meter and holds the call for the app like any drop. Hanging up waits up to
  4 seconds for the server's summary.
- **The screen** (`src/components/voice/VoiceCallScreen.tsx`, cards in `src/components/voice/VoiceCallCards.tsx`): what the call is doing
  (connecting, listening, the user speaking, thinking and what it is waiting on, speaking, waiting for consent,
  bringing the line back), an orb
  that follows the voices, what was said as captions (on by default, can be hidden, never stored), the cards (a
  figure with its period and what it leaves out, a draft with confirm and cancel buttons, guide steps with a button
  to the screen, a price with its source and time), typing instead of speaking, mute, and hang up. A refused
  microphone keeps the call going by text. The end screen lists what was done and what was not and how long the call
  was; a call that cannot start says why and offers the chat. Admins also see a trace (round trip, first-audio
  latency, reconnects, frames sent, noise floor, playback queue).
- **Ultra Thinking.** When `ready` says it is offered, the screen shows a "تفكير أعمق" switch under the call's state
  (`src/components/voice/VoiceCallScreen.tsx#UltraSwitch`): pressed while the call is in that mode, with a line saying it is slower and
  checks more; "بنشغّل…" while switching; a refusal shows why. The choice is remembered on the device
  (`src/lib/voice/call-store.ts#preferredMode`) and the next call asks to start in it.
- **After a confirmed draft** the app refreshes every query, so what the call recorded shows behind it at once.
- **Signing out.** `VoiceCallHost` is mounted for one account (keyed by its type and id in `src/App.tsx`); when the
  account signs out or another signs in, it unmounts and `voiceCall.signOut` (`src/lib/voice/call-store.ts`) ends the
  call, closes the microphone and the line, and clears the screen, so nothing of the call is left for the next person.
- **After the call** the end screen opens the memory screen (`src/components/ai/AIMemoryManager.tsx`, from
  `VoiceCallHost`), looked at again six seconds later because the summary is written just after the call.

### In the admin console
The settings page's plans tab has a section for the call
(`src/components/admin/settings/AdminVoiceCallSection.tsx`), saved with the rest of the settings form:
- **Stop:** the kill switch (`voice_v2_kill_switch`) stops every call and hides the ways in.
- **Models:** the default Live model (`voice_v2_model`) and one per plan (`voice_v2_model_<plan>`, empty means the
  default), the thinking level for the extended-thinking model, and the text models of `think`, `market_price` and
  the post-call summary.
- **The coach and Ultra Thinking:** the coach's rollout percent and test accounts, Ultra's model and thinking level
  (`voice_coach_*`; the hint names LOW as the level being qualified), and the plans Ultra is offered on
  (`voice_ultra_enabled_<plan>`). The choices come from `contracts/voice-models.ts`, which `api/lib/model-mapper.ts` also
  builds its fallback chain from.
- **Cost:** the daily provider-cost cap per plan (`voice_daily_cost_cap_usd_<plan>`).
- **Capacity:** live calls at once per model pool and per user (`voice_max_concurrent_calls`,
  `voice_ultra_max_concurrent_calls`, `voice_max_calls_per_user`), to be set from the project's real limits in AI
  Studio; the defaults (20, 3, 1) are placeholders, not measured capacity.
- **Dashboard:** `voice.adminStats` (admin only, `api/services/voice/admin-stats.ts`) over the last day, 7 or 30
  days: calls, callers, minutes, cost at Google and per minute (tools included), first-audio median and p95, tools
  and reconnects per call, why calls ended, incidents by kind, post-call memory status, clients, minutes and cost per
  model, coach profile, whether the call used Ultra Thinking and thinking level (from `voice_calls.metrics`), and the
  25 latest calls. It reads `voice_calls` and `voice_call_incidents` only: counts, times
  and costs, never what was said.
Monthly minutes, seconds per call and whether a plan may call at all are in the card above it.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Which origins may open the socket | `api/lib/origin-policy.ts` | |
| Who may call, minutes, model, the kill switch | `api/services/entitlements/voice.ts` and the `voice_v2_*` settings, set in `src/components/admin/settings/AdminVoiceCallSection.tsx` | `api/services/entitlements/voice.test.ts`, `src/components/admin/settings/AdminVoiceCallSection.test.tsx` |
| the admin's dashboard | `api/services/voice/admin-stats.ts`, `voice.adminStats` in `api/voice-router.ts` | `api/services/voice/admin-stats.test.ts` |
| Which Gemini models can be chosen | `contracts/voice-models.ts` | `api/lib/model-mapper.test.ts` |
| the socket, resume, time and cost limits, checkpoints | `api/services/voice/gateway/` | `api/services/voice/gateway/gateway.test.ts` |
| seats per model and per user, the quota breaker | `api/services/voice/gateway/admission.ts` | `api/services/voice/gateway/admission.test.ts` |
| holding back the extended model's lost-call apology | `api/services/voice/gateway/lost-call-guard.ts`, the notes in `api/services/voice/brain/claims.ts` | `api/services/voice/gateway/lost-call-guard.test.ts`, `api/services/voice/gateway/gateway.flow.test.ts` |
| the connection to Gemini Live | `api/services/voice/engine/gemini-live.ts` | `api/services/voice/engine/gemini-live.test.ts` |
| the coach call: who gets it, its instructions and tools | `api/services/entitlements/voice.ts`, `api/services/voice/brain/coach-instructions.ts`, `COACH_TOOLS` in `api/services/voice/brain/index.ts` | `api/services/entitlements/voice.test.ts`, `api/services/voice/brain/coach.test.ts` |
| Ultra Thinking: who is offered it, its instructions, the switch | `api/services/entitlements/voice.ts`, `ULTRA_SECTION` in `api/services/voice/brain/coach-instructions.ts`, `CallSession#switchMode`, `src/components/voice/VoiceCallScreen.tsx#UltraSwitch` | `api/services/entitlements/voice.test.ts`, `api/services/voice/gateway/gateway.flow.test.ts`, `src/lib/voice/call-controller.test.ts` |
| the calculator | `api/services/voice/brain/tools/calculate.ts` | `api/services/voice/brain/tools/calculate.test.ts` |
| instructions, snapshot, how numbers are spoken | `api/services/voice/brain/instructions.ts`, `api/services/voice/brain/snapshot.ts`, `api/services/voice/brain/spoken.ts` | `api/services/voice/brain/spoken.test.ts` |
| the tools | `api/services/voice/brain/tools/`, and `api/services/voice/app-calls.ts` for the procedures they call | `api/services/voice/brain/tools/*.test.ts`; `api/services/voice/brain/tools/declarations.test.ts` holds every field typed and all declarations under 6,500 characters |
| the stored reports and waiting questions it reads | `api/services/voice/brain/tools/reports.ts` | `api/services/voice/brain/tools/reports.test.ts` |
| which profile questions a call may ask, and how an answer is checked | `api/services/voice/brain/profile-questions.ts` | `api/services/voice/brain/profile-questions.test.ts` |
| what the screen says while a tool runs | `waitDetail` in `api/services/voice/brain/index.ts`, `WAITING` in `src/components/voice/VoiceCallScreen.tsx` | |
| the number check and the confirmation gate | `api/services/voice/brain/validator.ts`, `api/services/voice/brain/drafts.ts` | `api/services/voice/brain/validator.test.ts`, `api/services/voice/brain/drafts.test.ts` |
| Messages between the app and the server | `contracts/voice-protocol.ts` | `tests/voice-protocol.test.ts` |
| what is remembered after a call, and what never is | `api/services/voice/post-call.ts`, `api/services/voice/brain/never-kept.ts`, the `voice_memory_model` setting | `api/services/voice/post-call.test.ts` |
| saying a waiting draft is done | `api/services/voice/brain/claims.ts` | `api/services/voice/brain/claims.test.ts` |
| In the app: when the user is speaking, and what is sent | `src/lib/voice/speech-detector.ts`, `src/lib/voice/downsampler.ts` | `src/lib/voice/speech-detector.test.ts`, `src/lib/voice/downsampler.test.ts` |
| In the app: the line, resuming a dropped call | `src/lib/voice/call-connection.ts` | `src/lib/voice/call-connection.test.ts` |
| In the app: what the screen shows, playback, mute, typing | `src/lib/voice/call-controller.ts`, `src/lib/voice/pcm-player.ts`, `src/components/voice/` | `src/lib/voice/call-controller.test.ts`, `src/lib/voice/pcm-player.test.ts` |
| Who sees the ways into the call | `src/components/voice/CallSmartButton.tsx`, `src/components/voice/VoiceCallTab.tsx` | |

## Rules for changes here
1. A socket opens a call only with the single-use ticket `voice.startCall` gave the signed-in user: keep the ticket
   check before anything that reads user data or spends money.
2. Never invent numbers in voice: exact figures come from `money_query` or `think`, never from the model.
3. Actions stay two-step: a draft, then an explicit confirmation. High-risk actions must not run by voice.
4. Never log what the user or the assistant said (golden rule 10 in the root `AGENTS.md`): the handler logs the user's
   events with the call id, tool names, times, counts and short codes — never a transcript, a reply or a tool's
   arguments.
5. Session state belongs in Redis; the memory fallback exists for development and single-process setups.

## Tests
`tests/vite-voice.test.ts` starts a real Vite server and checks voice upgrades on its port, SSR routing, origin and
path rejection, coexistence with HMR, and an HTTP failure when the gateway cannot load.

`api/services/voice/post-call.test.ts` (the rules on what is kept, a summary written and its
words deleted, a call another server took, words already gone, a call with almost nothing said, retries); `api/services/voice/gateway/gateway.test.ts` runs whole calls over a real socket against
`tests/helpers/fake-gemini-live.ts` (a ticket, a tool call, captions, the end card, a ticket used twice, a dropped
call resumed on its handle, a wrong resume token, a socket gone silent, the grace period, the time limit, and
"thinking" held from a tool call until the answer is spoken);
`api/services/voice/engine/gemini-live.test.ts` (setup, key fallback, no second key after a quota refusal, what counts
as a quota refusal, GoAway, reconnects); the tests in
`api/services/voice/brain/` and `api/services/voice/brain/tools/` (among them the number check leaving an unrelated
figure alone, the profile questions and their answers, the stored reports, and every kind of `money_query`);
`api/services/entitlements/voice.test.ts` and `tests/voice-protocol.test.ts`.
`api/services/voice/gateway/gateway.flow.test.ts` runs turns over a real socket: a quick answer sent before a slow
one, "thinking" held while a tool outlasts the reply wait, IN_PROGRESS and IDLE of the extended-thinking model, a
tap's note held until the model is idle, a slow write reported as still running and then as done, the extended
model's lost-call apology kept from the user and the retry heard, a real answer after a filler released, and a read
that answers a replaced request marked as such, and a switch to Ultra Thinking (the new model's setup, the
conversation as history, the note, `switching` then `active`), a refusal when it is not offered, and the way back
with a message when the new model cannot connect. `api/services/voice/gateway/admission.test.ts` holds the pool, the one
call per user (id and type together), renewal of a held seat, expiry of a dead server's seat and the breaker.
`scripts/voice-eval/run.ts` evaluates the call against the real Gemini Live model: the cases of
`scripts/voice-eval/corpus.ts` (a tuning set and a held-out set), each on a fresh fabricated user
(`scripts/voice-eval/fixtures.ts`: a salaried user with loans, a gam3eya, an installment plan, wallets, a goal, a
budget and a business with its own spending) in a database whose name must end in `_eval`, typed turn by turn through
`CallSession`, the brain and the app's own procedures, with each arm (`coach:low|medium|high`, `standard`) run back
to back in a shuffled order. It checks tools, writes (expenses, new goals and budgets, every budget's limit and status, and commitments after the
call), incidents and false failure claims, and keeps every trace
(failed and timed-out ones too) and a summary under the ignored `.agents/` folder: the pass rate over every attempt
with its 95% interval (the rate without provider failures apart), per turn the first audio, tools done, the answer's
first audio, listening again and the estimated end of playback, incidents, and the cost at paid rates (an estimate,
not a bill). Typed turns measure understanding and tools, not the microphone.
`api/services/voice/app-calls.test.ts` holds a refund's direction and a person from parse to save;
`api/services/voice/brain/tools/record.actions.test.ts` holds that an action drafted in a call runs once. In the app, `src/lib/voice/` tests the
resampler (a 12 kHz hiss removed, blocks of any size), the speech detector (pre-roll, pauses, the two hangovers,
the assistant's own voice, a noise that stays), playback, the line (resume with the latest token, giving up, a silent
line, hanging up while connecting) and a whole call through the controller with a fake socket and fake audio. The
microphone, the speaker and the screen are checked by hand in a browser.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** A call does not go on with the screen locked or the app in the background: the page keeps the microphone
   only in the foreground, and the call resumes if the app comes back within the hold (`src/lib/voice/call-connection.ts`).
   Keeping it alive needs native work in the Android and iOS shells.
2. **Gap.** The speech detector's thresholds (`src/lib/voice/speech-detector.ts`) are tuned on synthetic audio in
   tests; they have not been checked against recordings of real users on phones in noisy places.
3. **Gap.** A business's own ledger can be read in a call (`money_query` with `scope: business`) but not written to:
   recording uses an explicit `record_draft.scope` (personal or business), checks the business feature again at confirmation, and asks instead of silently mixing ledgers; debts carry no due dates and several gam3eyas are added
   together (`api/services/debt-ledger.ts`); installments are counted from payments whose words name the plan
   (`api/services/installments.ts`); keyword matching is now an amount-based estimate, and overlapping names are reported as ambiguous instead of assigning a payment to both plans. Linked progress counts fully paid due dates separately.
4. **Bug (provider).** On `gemini-3.8-live-extended-thinking`, a tool call sometimes never reaches the app: the model
   says a line, stays IN_PROGRESS, then apologises for a "system error" with no `toolCall` message and no provider
   error, while `gemini-3.8-live` calls the tool every time. On 2026-09-30 at LOW, 42 of 49 single-tool probe runs
   passed (86%, 95% interval 73–93%) against 26 of 26 for the standard model, the same with a minimal raw setup and
   with the app's; between the filler and the apology only ~62 text tokens reach the model's context, so the call is
   lost inside the provider, cause unknown (`api/services/voice/engine/gemini-live.ts`). `LostToolCallGuard` keeps the
   apology from the user and asks again. The rate varies with time: in one later batch of 20 the first call was lost in
   13, the retries rescued 10 and 3 still failed. The extended model also takes about 4.6 seconds longer to call a
   tool and ~6× the tokens per turn. Ultra Thinking stays off until it is qualified.
5. **Gap.** The opening context (CALL FACTS) cannot be changed during a session: after the records change the model is
   told, and a stale figure said is recorded, but not stopped (`api/services/voice/brain/validator.ts`).
6. **Debt.** An action draft that expires, or that a newer draft replaces, leaves its runtime action pending until the
   runtime's own expiry (`api/services/voice/brain/tools/record.ts#dropRuntimeAction` runs on cancel only); nothing
   can confirm it from the call.

## Related systems
- [AI Center](ai-center.md): the finance semantic layer, AI memory and action runtime the tools call, and the page
  the call lives in.
- [AI providers and usage limits](ai-platform.md): the cost policy and cost metrics.
- [Accounts, sign-in and security](accounts.md): sessions and the origin policy.
- [Recording spending](expense-capture.md): voice dictation of expenses is a different feature with its own quota
  check.
- [Server platform and data](platform.md): Redis and the settings cache.

## Production boundaries (2026-10-01)
- The first PCM of a new spoken request advances its epoch; the old read carries `earlier_request` even before speech ends. A spoken yes is not usable while the user speaks or for 500 ms after their last transcription; a draft must actually have its amounts read back. A tap remains an explicit confirmation.
- The 8/16-second post-tool wait never sends an interrupting nudge while Extended reports IN_PROGRESS. A separate 90-second deadline covers reasoning before tools; it gives a clear notice and ends an unanswered request, while a write already started remains an unknown outcome until its result.
- Mode switches refuse running tools, unresolved writes and pending consent. Up to 320 KB/600 events of input are replayed in order after connection, or the call ends explicitly on overflow. Connection generations close engines opened after cancellation; switching time is not billed. Moving pools retains the user seat; Redis failure cannot silently use process-local admission in production.
- Redis call state uses owner/epoch/revision comparisons and a content-free tombstone after ending. A stale owner cannot overwrite a takeover. Every confirmed draft claims durable one-time write permission in `voice_calls.metrics.writeClaims` before execution; checkpoints preserve those claims. An unknown write must be inspected in the app, never blindly retried.
- Model segments carry the effective model, mode, thinking level, time, provider tokens and tool cost through resumption. Admin statistics and the AI cost ledger attribute each segment to that model.
- Capacity settings include input TPM and a per-call reservation for each mode; admission uses the smaller of the seat cap and 80% of input TPM divided by the reservation. The owner reported 65k TPM for standard; the visible AI Studio Free-tier project also shows 65k for Extended, with unlimited RPM/RPD. Defaults reserve 30k/60k TPM: one standard call and no Extended seat after headroom until its reservation is reduced on evidence or quota increased. These estimates do not guarantee capacity on arbitrary long calls. Ultra stays disabled until qualified.
- Claim checks recognize explicit technical failures instead of a bare «عطل». Number checks bind explicit financial nouns to the fact metric and reject stale facts as correction targets: a fact of another metric (a salary for a spending claim) never backs a number, while a fact whose label names no metric (a category total labelled «أكل وشرب») still can, since silence about the subject is not a different subject. This is a guard, not a complete proof of every sentence’s meaning.
- Memory writes use the account-row transaction lock, compare precise observation times before replacing a slot and roll back replacement with insertion. Forgetting suppresses pending/active voice summaries durably; finalization cannot undo the barrier.
- Regression evidence: `tests/voice-production-regressions.test.ts`, draft/record tests, real Redis `api/services/voice/gateway/shared-state.integration.test.ts`, and migrated MySQL `tests/voice-memory-slots.test.ts`. Real Egyptian microphone recordings, physical phone/Bluetooth testing and repeated live-model qualification remain release requirements.

### Complete financial previews
Both models hold the beginning of a pending draft preview briefly using a separate preview guard. A premature «سجلنا» or «حفظت» is suppressed and corrected once per request, with `done_claim_suppressed` counted separately from claims the user heard. A second suppressed completion claim ends the call with a notice to inspect the draft in the app. A preview without its amounts is re-requested once; it never grants voice consent. The hold is bounded and transcripts have no guaranteed exact alignment with audio, so live-model and device qualification remains necessary.
