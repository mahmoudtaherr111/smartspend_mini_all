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
(`voice_daily_cost_cap_usd_<plan>`), and whether the user gets [the coach call](#the-coach-call) (`coach`);
`voice_v2_kill_switch` stops every call and hides the ways in. Usage is the
Cairo month's `voice_calls.billed_seconds` plus any `voice_usage` rows (source `gemini_voice_call`) the removed
first call wrote that month, never dictation seconds.

### One call, step by step
1. `voice.startCall` (`api/voice-router.ts`, `api/services/voice/gateway/start-call.ts#startVoiceCall`) checks the
   entitlements, twelve starts per ten minutes per user, and that Redis (or the development memory fallback) can hold
   call state; closes the user's calls a crashed server left open (`closeAbandonedCalls`); writes the
   `voice_calls` row; and returns a ticket that opens one call within 60 seconds. `voice.eligibility` tells the app
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
   recorded day, one observation, up to five remembered things, and the next profile question the app has no answer
   to, from `api/services/voice/brain/profile-questions.ts`, unless the app asked one in the last day; offering one
   starts that day's pause, `user_profiles.last_asked_at`, which the Home card shares), the instructions
   (`api/services/voice/brain/instructions.ts`, kept short because they are billed every turn) and nine tools. It connects the engine
   (`api/services/voice/engine/gemini-live.ts#GeminiLiveEngine`): input and output transcription on, session
   resumption, a context window of 16k tokens trimmed to 8k, tools NON_BLOCKING, the key in a header, and the second
   key when the first cannot open a session, and Google's own end-of-turn detection set to wait a full second. Then it
   sends `ready` (with a resume token) and an opening note that makes the model greet without numbers.
4. The app sends 16 kHz PCM only while the user speaks and `speech_end` when they stop, which the engine turns into
   `audioStreamEnd` so the model answers without waiting for silence. The model's 24 kHz audio, live captions,
   the state (listening, thinking, speaking, awaiting confirmation) and cards come back. Captions are shown, never
   stored. The state follows the work, not a timer: from a tool call it stays "thinking" while any tool of the call
   runs, and once the last answer is in the model has 8 seconds to start speaking (16 for the extended-thinking model)
   before the screen gives up and a `no_reply_after_tool` incident is recorded. The extended-thinking model reports its
   task apart from its speech (`interactionStatus`): the engine turns IN_PROGRESS into `working` and IDLE into `idle`,
   so a spoken filler line ends in "thinking", and only IDLE returns to "listening". Each tool answer goes back to the
   model the moment it is ready (`CallSession#runTools`), never held behind a slower one. The state carries what the call is waiting on
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
had it. Nobody gets it by default. A coach call runs on `voice_coach_model` (default
`gemini-3.8-live-extended-thinking`) at `voice_coach_thinking_level` (default `high`), whatever the plan's standard
model; the ticket and the call's state carry `coach`, and a coach call that cannot reach its model ends with the
provider error rather than moving to the standard one.

Its brain (`createCallBrain` with `coach`) has its own instructions
(`api/services/voice/brain/coach-instructions.ts#buildCoachInstruction`: understand the need behind everyday
words, keep the thread, one question that changes the advice, the coaching path from goal to one agreed step, the
meanings not to mix — income and balance, left this month and available today, capacity and savings — and the
consent rules) and its own tools (`COACH_TOOLS`): no `think`, and `calculate` for every sum. The facts in its opening
context and in every tool answer carry a ref ("f12") that `calculate` takes.

### The tools
| Tool | What it does |
| --- | --- |
| `money_query` | Any figure from the finance semantic layer, one call per question: totals (by category, a person's spending or, with `type: income`, what they paid the user, or everything spent at a shop over the whole period), where the money went, a comparison with the same number of days of the previous period (of the named category when there is one) and which categories drove it, the latest transactions, why one transaction got its category (found by a word from it, a category or its amount, each a filter over the whole period), what a category counts, a month's report already written (below), whether an amount is affordable (the month so far, said as a shortfall when spending passed income, the wallet total and the active goals, for `think` to judge), wallet balances (said to be as recorded, not a live statement), budgets (`budget.list`, cached a minute and dropped by any budget or expense write), goals, the entries still waiting for the user's answer (below), and, through the procedures of their screens, debts and the gam3eya (`expense.getDebtBalances`: each person's balance and the gam3eya's paid, received and installments, with a note that it rests on the loans recorded as transfers, has no due dates, and adds several gam3eyas together), installment plans (`expense.listInstallmentPlans`, with a note on how payments are counted) and a season's spending (`expense.getSeasonSpending`). Every fact carries a ref for `calculate`. Before each read the tool compares the user's ledger generation with the one the call last saw: moved without a write of the call's own (a bank message, another device), every earlier figure is marked out of date and the answer says so (`records_changed`). Looking up a transaction searches the last 90 days unless a period is named. Categories are said in Arabic. A period too busy to read in full (more than 10,000 entries) is said to be counted in part. Each result carries the facts with their spoken form, a note on missing data, and a card |
| `record_draft` | Parses what the user says they spent or received through `ai.parseExpense`, checks the amounts against what the model understood and against the numbers heard from the user, and drafts; a disagreement asks about that number alone ("خمستاشر ولا خمسين؟"). Each item keeps what the parser found beyond its category, through the same helpers as the expense form (`contracts/expense-save.ts`): a refund's direction (saved negative in its category, and shown as "مرتجع"), a loan's or gam3eya's way, the person beside a purpose. A draft mixing kinds (spending and a refund) has no single total. With a `clarification_id` it finishes an entry left waiting: the words the user first typed, read from the database, with their answer in brackets, joined as `expense.answerClarification` joins them; the numbers of those first words count as heard from the user, and the entry is closed only when that draft is confirmed |
| `change_draft` | Drafts a goal, budget, wallet, profile detail (never age or gender) or recategorization through the action runtime, or undoing what this call recorded. The runtime's pending action is created with the draft, so every confirmation runs that one id; cancelling the draft cancels it |
| `confirm` / `cancel` | Executes or drops a draft through the gate below; an executed write marks every figure read before it out of date and tells the model so (`records_changed`); expenses are saved with `expense.batchCreate` with `clientRequestId` `vc:<call>:<draft>:<n>`, so a retry never saves twice; an action runs through `confirmAction` with `suggestFollowUp: false`, so no budget draft is left that the call cannot show |
| `memory` | Searches the AI memory, remembers what the user asks it to (never age or gender), deletes a memory by id when asked to forget it, lists what the app knows when asked ("إنت عارف عني إيه": job, payday, income, goal, monthly debt payment, the eight latest memories, and the screen where they can be seen and deleted), and saves the answer to the call's profile question, or its refusal, through `profile.submitOnboardingAnswer` once the answer fits the question's type |
| `app_help` | Steps from the site guide, or says the guide has nothing, with what the call can and cannot do |
| `calculate` | The coach call's arithmetic (`api/services/voice/brain/tools/calculate.ts`): steps of add, sub, mul, div, sum, min, max, pct and round over fact refs, earlier steps, counts ("12 months", "30 days"), percents, and amounts only when the user said them. Decimal arithmetic with units: pounds with pounds, pounds times days or months or a count, pounds over days is pounds a day, pounds times pounds refused. Each result becomes a fact the call may say, with how it was made; one built on a figure that went out of date is out of date too. Nothing is written when a step fails |
| `think` | The standard call only. Hard questions go to a text model through `executeAiGateway` with the user's numbers: `voice_think_model` (default `gemini-3.5-flash-lite`, fast because the caller is waiting), then the next model of the chain after 5 seconds, and 9 seconds in all. Numbers it returns survive only if they come from the data, from the user, or one step of arithmetic on them (a product only with a count on one side); a verdict, alternative or missing fact carrying any other amount is dropped whole. This is a plausibility screen, not a check of meaning |
| `market_price` | Gold or currency prices in Egypt from a text model with Google Search (`voice_price_model`, default `gemini-3.5-flash-lite`, through `askTextModel` with the same 5- and 9-second limits and the chain's other models), within sane bounds, cached 30 minutes for everyone, with its source and time; when the source names no time, the time of the lookup on Cairo's clock |

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
  with, and the income and debt payment `memory list` reads, count as the user's own. Amounts are spoken as `api/services/voice/brain/spoken.ts` writes them
  ("تمن آلاف وربعمية", "حوالي خمستاشر ألف").
- **Writes.** `api/services/voice/brain/drafts.ts#DraftBook`: only the latest pending draft, within two minutes, and
  only after a tap on its card or the user's own yes said after the assistant presented it (its first words after the
  draft was made). `readReply` reads the reply with a "no" first: a negation (also wrapped around the verb,
  "ماتسجلش"), a change, a new number, a condition ("لو"), a reservation ("بس"), only understanding ("بفهم"),
  someone else's words ("قال"), a question or "later" wins over any yes it comes with; "الغيها" is a yes only to an
  undo; a yes with more than three other words is asked again. User words after the assistant spoke are a new
  utterance, never the tail of an earlier one. Passing the gate claims the draft (`executing`), so a tap and a yes
  arriving together run it once; a claim whose write never started (the call stopped it) is released.
- **Out-of-date figures.** A number said that the call knows only from facts read before the records changed is recorded
  as a `stale_number` incident (not corrected: it was true when read, and the model was told the records changed).
- **The app's notes.** Every note the app sends the model is tagged with the call's own mark
  (`CallBrain#appNote`, "ملاحظة من التطبيق #a1b2c3"), which the instructions name as the only sign of a note from the
  app; the mark is never sent to the app or spoken, so words the user types or says claiming to be from the app are
  taken as theirs.
- **Saying it is done.** `api/services/voice/brain/claims.ts#DoneClaimCheck`: while a new record or action waits
  for consent, a reply that calls it recorded or done ("سجلت", "اتسجل", "اتعمل") gets a note at once that makes the
  model say it is still waiting and ask; the `done_claim_before_confirm` incident records only that it happened.
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
than a few words, asks a text model once for a summary of at most two sentences and at most five things to remember
(plans, agreements, preferences, stable facts), with the user's 30 latest memories so it does not repeat them and can
name one a new fact replaces. `readCallMemory` holds the answer to the rules whatever the model wrote: at most five
facts, only known ids replaced, and nothing about age, gender, health, religion or a judgment of the person
(`api/services/voice/brain/never-kept.ts`). The summary is written to `ai_memory_items` as a `summary` ("مكالمة 23/9:
…"), the facts under their own types, both with `metadata.source` `voice_call` and the call id; a replaced memory
becomes `replaced`. Then the words are deleted and the call's `memory_status` becomes `saved` (or `empty`), with the
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
- **After a confirmed draft** the app refreshes every query, so what the call recorded shows behind it at once.
- **After the call** the end screen opens the memory screen (`src/components/ai/AIMemoryManager.tsx`, from
  `VoiceCallHost`), looked at again six seconds later because the summary is written just after the call.

### In the admin console
The settings page's plans tab has a section for the call
(`src/components/admin/settings/AdminVoiceCallSection.tsx`), saved with the rest of the settings form:
- **Stop:** the kill switch (`voice_v2_kill_switch`) stops every call and hides the ways in.
- **Models:** the default Live model (`voice_v2_model`) and one per plan (`voice_v2_model_<plan>`, empty means the
  default), the thinking level for the extended-thinking model, and the text models of `think`, `market_price` and
  the post-call summary.
- **The coach:** its model, its thinking level, the rollout percent and the test accounts (`voice_coach_*`). The choices come from `contracts/voice-models.ts`, which `api/lib/model-mapper.ts` also
  builds its fallback chain from.
- **Cost:** the daily provider-cost cap per plan (`voice_daily_cost_cap_usd_<plan>`).
- **Dashboard:** `voice.adminStats` (admin only, `api/services/voice/admin-stats.ts`) over the last day, 7 or 30
  days: calls, callers, minutes, cost at Google and per minute (tools included), first-audio median and p95, tools
  and reconnects per call, why calls ended, incidents by kind, post-call memory status, clients, minutes and cost per
  model, coach profile and thinking level (from `voice_calls.metrics`), and the 25 latest calls. It reads `voice_calls` and `voice_call_incidents` only: counts, times
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
| the connection to Gemini Live | `api/services/voice/engine/gemini-live.ts` | `api/services/voice/engine/gemini-live.test.ts` |
| the coach call: who gets it, its instructions and tools | `api/services/entitlements/voice.ts`, `api/services/voice/brain/coach-instructions.ts`, `COACH_TOOLS` in `api/services/voice/brain/index.ts` | `api/services/entitlements/voice.test.ts`, `api/services/voice/brain/coach.test.ts` |
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
`api/services/voice/engine/gemini-live.test.ts` (setup, key fallback, GoAway, reconnects); the tests in
`api/services/voice/brain/` and `api/services/voice/brain/tools/` (among them the number check leaving an unrelated
figure alone, the profile questions and their answers, the stored reports, and every kind of `money_query`);
`api/services/entitlements/voice.test.ts` and `tests/voice-protocol.test.ts`.
`api/services/voice/gateway/gateway.flow.test.ts` runs turns over a real socket: a quick answer sent before a slow
one, "thinking" held while a tool outlasts the reply wait, IN_PROGRESS and IDLE of the extended-thinking model, a
tap's note held until the model is idle, and a slow write reported as still running and then as done.
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
3. **Gap.** A business's own ledger has no voice tool, and the finance layer reads the personal ledger only
   (`api/services/finance-semantic-layer/resolvers.ts`); debts carry no due dates and several gam3eyas are added
   together (`api/services/debt-ledger.ts`); installments are counted from payments whose words name the plan
   (`api/services/installments.ts`), so a partial payment or two plans with one word are miscounted.
4. **Gap.** The opening context (CALL FACTS) cannot be changed during a session: after the records change the model is
   told, and a stale figure said is recorded, but not stopped (`api/services/voice/brain/validator.ts`).
5. **Gap.** Forgetting a memory during a call deletes it, but the words of the call still hold it, and the post-call
   summary (`api/services/voice/post-call.ts#summarizeCall`) is not told to leave it out.
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
