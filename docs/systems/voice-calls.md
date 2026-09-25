# Live voice assistant

The live voice call: the app streams the user's voice over a WebSocket, the server bridges it to the Gemini Live
API with a short financial context and a set of tools, streams the assistant's voice back, enforces the plan's call
minutes, and keeps what the call should remember. Two versions run side by side: the old call in the AI Center,
described first, and the rebuilt call ([below](#the-rebuilt-call)), open to staff and the allowlist and to others by
rollout, which will replace it.

- Facts generated from the code, with diagrams: [docs/atlas/systems/voice-calls.md](../atlas/systems/voice-calls.md)
- The same story for readers who do not read code: [docs/ar/systems/voice-calls.md](../ar/systems/voice-calls.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Call screen | `src/components/ai/AIVoiceCall.tsx#AIVoiceCall`, a tab of the AI Center page | Voice selection, call controls, status and the tool trace |
| Browser audio | `src/hooks/useVoiceCall.ts#useVoiceCall` | Microphone capture resampled to 16 kHz PCM, the WebSocket, playback of the assistant's audio |
| Socket entry | `server.on("upgrade")` for `/api/voice/live` in `api/boot.ts` and `api/server.ts` | Origin check, then hands the socket to the call handler |
| Call handler | `api/services/voice-call-service.ts#handleVoiceCallWebSocket` | Authentication, plan limits, session, Gemini Live bridge, tools, end of call |
| Voice kernel | `api/services/voice-kernel/` | Session state, hot context, system prompt, tools, prefetch, archive |
| QA procedure | `ai.runVoiceToolQa` in `api/ai-router.ts` | Runs one voice tool without a call; development only |
| Rebuilt call, app side | `src/lib/voice/`, `src/components/voice/` | One call for the whole app: capture with speech detection, playback, the socket client, the call screen and its ways in |
| Rebuilt call, server side | `api/voice-router.ts`, `api/services/voice/`, `api/services/entitlements/voice.ts` | Who may call, the ticket, the `/api/voice/v2` socket, the Gemini Live engine, the brain and its tools |

## One call, step by step

### 1. The browser opens the call
`useVoiceCall.startCall(voice)` asks for the microphone with echo cancellation, noise suppression and automatic
gain, builds an AudioContext, and loads an AudioWorklet that resamples the microphone to 16 kHz 16-bit PCM in
chunks of 2048 samples. It opens `wss://<host>/api/voice/live?token=<token>&voice=<voice>` (the host of
`VITE_API_URL` when set), with the token from `local_auth_token` in browser storage; Google users send an empty
token and are authenticated by their cookie. Every chunk is sent while the call is not muted, silence included, so
the model's voice activity detection keeps working. The screen offers three voices (Olivia, Sarah and James); the
server accepts `Aoede`, `Charon`, `Fenrir`, `Kore` and `Puck`, and falls back to `Aoede`.

### 2. The server accepts the socket
- The upgrade handler accepts only paths starting with `/api/voice/live` and an allowed origin
  (`api/lib/origin-policy.ts#createOriginPolicy`; a request without an Origin header is allowed for native
  clients).
- `authenticateUser` validates the `token` parameter, or the `google_session` cookie, as an active session and
  loads the user row.
- Plan checks read system settings, falling back to defaults written in the handler: `voice_call_enabled_<plan>`,
  `voice_call_limit_<plan>` (minutes a month), `voice_call_duration_<plan>` (seconds a call), `voice_call_model`,
  `ai_api_key` (else `GEMINI_API_KEY`) and `ai_api_key_2`. The call may last the smaller of the per-call duration
  and the seconds left this month, counted from the `voice_usage` rows of the month. A disabled plan or an empty
  allowance closes the socket with an Arabic message.

### 3. Context before the first word
- `api/services/voice-kernel/voice-session-state.ts#createVoiceSessionState` stores the session in Redis for an
  hour, or in process memory only where the cache runtime allows a memory fallback. Without either, the call is
  refused and the user is told Redis is missing.
- `api/services/voice-kernel/hot-context.ts#buildVoiceHotContext` gathers, from SQL and the finance layer and
  without embeddings: the profile snapshot, today's and this month's income and expense, up to five active goals,
  and up to five recent memory hints (memory items, conversation capsules, action memory).
- `api/services/voice-kernel/voice-prompt.ts#buildVoiceSystemPrompt` turns it into the system prompt: short Egyptian
  Arabic replies, tools for exact numbers, never invented numbers, a draft and an explicit confirmation before any
  action, and no voice execution for high-risk actions.

### 4. Bridging to Gemini Live
The handler opens the Gemini Live WebSocket with the model (`resolveLiveModelId` adds the `models/` prefix), audio
responses in the chosen voice, the system prompt and `VOICE_TOOL_DECLARATIONS`, and waits up to five seconds for
setup. When the primary key fails it logs the error to `api_key_errors` and tries `ai_api_key_2`. It then tells the
browser `ready` (model and session id) and sends a greeting request so the assistant speaks first.

During the call:
- browser audio chunks go to Gemini as `realtimeInput` PCM; a text message `end_call` ends the call, and
  `user_transcript` text joins the call transcript;
- Gemini's audio comes back to the browser as binary frames (the handler reads the three shapes the API uses),
  its text is forwarded, and its input and output transcriptions join the transcript;
- `interrupted` makes the browser stop playing; a warning is sent ten seconds before the time limit, and
  `limit_reached` when it arrives.

The first transcript that arrives within 2.5 seconds of the start triggers
`api/services/voice-kernel/voice-prefetch.ts#prefetchVoiceTurnContext`, which routes the intent and resolves its
structured finance data needs ahead of time.

### 5. Tools
`api/services/voice-kernel/voice-tool-adapter.ts#executeVoiceTool` runs what the model calls:

| Tool | What it does |
| --- | --- |
| `finance_query` | Exact finance data through the finance semantic layer (`resolveKernelDataNeeds`): summary, wallet summary, period comparison, category total, breakdown, transactions, chart data or goal progress, for a period from today to the salary cycle or custom dates |
| `memory_search` | Searches the user's AI memory (`retrieveMemoryContext`) |
| `action_draft` | Validates a payload for a goal, expense, budget, profile or wallet action and keeps it pending in the session for 30 minutes; stopping a goal is high risk, the rest medium |
| `action_confirm` | For a medium-risk draft, creates the pending action in the action runtime and confirms it, which executes it. A high-risk draft is refused: it needs its confirmation words typed in the chat ([AI Center](ai-center.md)), and the result carries an Arabic reason the assistant says and the call screen shows |
| `action_cancel` | Cancels a pending draft |

`api/services/voice-call-service.ts#shouldExecuteLiveVoiceTool` enforces the call's tool budget from
`api/services/ai-cost-policy.ts#resolveAICostPolicy` for the `voice` channel, which is capped at one round:
`finance_query`, `memory_search` and `action_draft` count toward it, `action_confirm` and `action_cancel` never do.
A blocked call returns `voice_tool_limit_exceeded` to the model. Every tool run is summarized to the browser for the
trace panel (`summarizeVoiceToolResponse`) without the raw facts.

### 6. The end of the call
When the browser closes, sends `end_call`, Gemini closes, or the time is up, the handler (once):
1. records the elapsed seconds in `voice_usage` with source `gemini_voice_call`;
2. archives the transcript (`api/services/voice-kernel/voice-call-archive.ts#persistVoiceCallArchive`): a new chat
   conversation named "Voice call archive <date>" holding one summary message, and the last messages written to AI
   memory with source `voice`;
3. ends and clears the session state;
4. records an AI cost metric, estimating six tokens a second.

## The rebuilt call
The call is rebuilt beside the one above, on its own socket. Staff and the users in `voice_v2_allowlist` get it
now, others as `voice_v2_rollout_percent` grows; everyone else keeps the old call, and `voice.startCall` answers
`legacy` for them.

### Who may call
`api/services/entitlements/voice.ts#getVoiceEntitlements` returns one typed object: whether the plan may call
(`voice_call_enabled_<plan>`), minutes a month (`voice_call_limit_<plan>`), seconds a call
(`voice_call_duration_<plan>`), the model (`voice_v2_model_<plan>`, else `voice_v2_model`, default
`gemini-3.8-live`), the thinking level for the extended-thinking model, a daily provider-cost cap in USD
(`voice_daily_cost_cap_usd_<plan>`), and whether this user gets the new call: staff and the users in
`voice_v2_allowlist` always, others when their stable bucket falls under `voice_v2_rollout_percent`;
`voice_v2_kill_switch` sends everyone back to the old call. Usage is the Cairo month's
`voice_calls.billed_seconds` plus the old call's `voice_usage` rows (source `gemini_voice_call`), never dictation
seconds.

### One call, step by step
1. `voice.startCall` (`api/voice-router.ts`, `api/services/voice/gateway/start-call.ts#startVoiceCall`) checks the
   entitlements, twelve starts per ten minutes per user, and that Redis (or the development memory fallback) can hold
   call state; closes the user's calls a crashed server left open (`closeAbandonedCalls`); writes the
   `voice_calls` row; and returns a ticket that opens one call within 60 seconds. `voice.eligibility` tells the app
   which call to show and the minutes left; `voice.listCalls` lists the user's recent calls.
2. The app opens `/api/voice/v2` (`createVoiceUpgradeHandler` in `api/services/voice/gateway/index.ts`, called from
   the `upgrade` listeners of `api/boot.ts` and `api/server.ts`; allowed origins only, 64 KB frames) and sends
   `hello` with the ticket (`contracts/voice-protocol.ts`). The session token never travels in the URL.
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
   stored. From a tool call until the model starts speaking its answer the state stays "thinking" (for 8 seconds at
   most), instead of showing "listening" while the answer is prepared. The state carries what the call is waiting on
   (`VoiceWaitDetail`: records, a report, memory, a calculation, a price, the guide, a draft), named by
   `waitDetail` in the brain from the tools called, so the screen can say "بيراجع حساباتك…" or "بيجيب السعر…".
   Each tool call is logged with its name, how long it took, whether it answered and a refusal's short code
   (`voice.tool`), never its arguments or its answer.
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

### The tools
| Tool | What it does |
| --- | --- |
| `money_query` | Any figure from the finance semantic layer, one call per question: totals (by category, person or merchant), where the money went, a comparison with the same number of days of the previous period and which categories drove it, the latest transactions, why one transaction got its category (found by a word from it, a category or its amount), what a category counts, a month's report already written (below), whether an amount is affordable (the month so far, the wallet total and the active goals, for `think` to judge), wallet balances (said to be as recorded, not a live statement), budgets (`budget.list`, cached a minute and dropped by any budget or expense write), goals, and the entries still waiting for the user's answer (below). Looking up a transaction searches the last 90 days unless a period is named. Categories are said in Arabic. A period too busy to read in full (more than 10,000 entries) is said to be counted in part. Each result carries the facts with their spoken form, a note on missing data, and a card |
| `record_draft` | Parses what the user says they spent or received through `ai.parseExpense`, checks the amounts against what the model understood and against the numbers heard from the user, and drafts; a disagreement asks about that number alone ("خمستاشر ولا خمسين؟"). With a `clarification_id` it finishes an entry left waiting: the words the user first typed, read from the database, with their answer in brackets, joined as `expense.answerClarification` joins them; the numbers of those first words count as heard from the user, and the entry is closed only when that draft is confirmed |
| `change_draft` | Drafts a goal, budget, wallet, profile detail (never age or gender) or recategorization through the action runtime, or undoing what this call recorded |
| `confirm` / `cancel` | Executes or drops a draft through the gate below; expenses are saved with `expense.batchCreate` with `clientRequestId` `vc:<call>:<draft>:<n>`, so a retry never saves twice |
| `memory` | Searches the AI memory, remembers what the user asks it to (never age or gender), deletes a memory by id when asked to forget it, lists what the app knows when asked ("إنت عارف عني إيه": job, payday, income, goal, monthly debt payment, the eight latest memories, and the screen where they can be seen and deleted), and saves the answer to the call's profile question, or its refusal, through `profile.submitOnboardingAnswer` once the answer fits the question's type |
| `app_help` | Steps from the site guide, or says the guide has nothing, with what the call can and cannot do |
| `think` | Hard questions go to a text model through `executeAiGateway` with the user's numbers: `voice_think_model` (default `gemini-3.5-flash-lite`, fast because the caller is waiting), then the next model of the chain after 5 seconds, and 9 seconds in all. Numbers it returns survive only if they come from the data, from the user, or one step of arithmetic on them |
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
  only after a tap on its card or the user's own yes said after it was presented, with no new number and no "لأ";
  "تمام" said before the draft is not consent.
- **Saying it is done.** `api/services/voice/brain/claims.ts#DoneClaimCheck`: while a new record or action waits
  for consent, a reply that calls it recorded or done ("سجلت", "اتسجل", "اتعمل") gets a note at once that makes the
  model say it is still waiting and ask; the `done_claim_before_confirm` incident records only that it happened.
  An undo draft is left out, because it speaks of what was recorded before.
- **Cost.** `api/services/voice/gateway/pricing.ts` prices the provider's token counts (Google's published Live
  rates) and the text models the tools ask (`textModelCostUsd`: `think`, a price lookup, which a cached price skips;
  thinking tokens count as output). A tool returns its cost, which joins the call's total and its daily cap
  (`toolCostUsd` in the metrics); the post-call summary's cost is kept with its tokens. The call's cost and tokens are checkpointed every 15 seconds with the billed seconds and first-audio
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
- **Ways in.** Users the rebuilt call is open to (`voice.eligibility` says `v2`) get a "كلّم سمارت" button on Home
  (`src/components/voice/CallSmartButton.tsx#CallSmartButton`, with the minutes left) and, in the AI Center's call
  tab, a screen to pick one of four voices and start (`src/components/voice/VoiceCallTab.tsx`,
  `src/components/voice/CallSmartButton.tsx#VoiceCallLauncher`). Everyone else keeps the old call tab. The first call opens with four lines
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

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Which plans may call, minutes a month, seconds a call, the model, the keys | the `voice_call_*` and `ai_api_key*` system settings; the fallbacks in `handleVoiceCallWebSocket` | |
| How many tools a call may use | `api/services/ai-cost-policy.ts` (the voice caps) and the `ai_cost_voice_max_tool_rounds` settings, which can only lower it | `api/services/voice-call-service.test.ts` |
| What the tools can do | `api/services/voice-kernel/voice-tool-adapter.ts`; the answers themselves come from the finance layer and the action runtime of the [AI Center](ai-center.md) | `api/services/voice-kernel/voice-tool-adapter.test.ts` |
| What the assistant knows before the first question, and its instructions | `api/services/voice-kernel/hot-context.ts`, `api/services/voice-kernel/voice-prompt.ts` | `api/services/voice-kernel/hot-context.test.ts`, `api/services/voice-kernel/voice-prompt.test.ts` |
| Where the session lives | `api/services/voice-kernel/voice-session-state.ts` | `api/services/voice-kernel/voice-session-state.test.ts` |
| What is kept after a call | `api/services/voice-kernel/voice-call-archive.ts` | |
| Microphone, playback and the socket in the browser | `src/hooks/useVoiceCall.ts` | |
| The call screen | `src/components/ai/AIVoiceCall.tsx` | |
| Which origins may open the socket | `api/lib/origin-policy.ts` | |
| Rebuilt call: who may call, minutes, model, rollout | `api/services/entitlements/voice.ts` and the `voice_v2_*` settings | `api/services/entitlements/voice.test.ts` |
| Rebuilt call: the socket, resume, time and cost limits, checkpoints | `api/services/voice/gateway/` | `api/services/voice/gateway/gateway.test.ts` |
| Rebuilt call: the connection to Gemini Live | `api/services/voice/engine/gemini-live.ts` | `api/services/voice/engine/gemini-live.test.ts` |
| Rebuilt call: instructions, snapshot, how numbers are spoken | `api/services/voice/brain/instructions.ts`, `api/services/voice/brain/snapshot.ts`, `api/services/voice/brain/spoken.ts` | `api/services/voice/brain/spoken.test.ts` |
| Rebuilt call: the tools | `api/services/voice/brain/tools/`, and `api/services/voice/app-calls.ts` for the procedures they call | `api/services/voice/brain/tools/*.test.ts`; `api/services/voice/brain/tools/declarations.test.ts` holds every field typed and all declarations under 6,500 characters |
| Rebuilt call: the stored reports and waiting questions it reads | `api/services/voice/brain/tools/reports.ts` | `api/services/voice/brain/tools/reports.test.ts` |
| Rebuilt call: which profile questions a call may ask, and how an answer is checked | `api/services/voice/brain/profile-questions.ts` | `api/services/voice/brain/profile-questions.test.ts` |
| Rebuilt call: what the screen says while a tool runs | `waitDetail` in `api/services/voice/brain/index.ts`, `WAITING` in `src/components/voice/VoiceCallScreen.tsx` | |
| Rebuilt call: the number check and the confirmation gate | `api/services/voice/brain/validator.ts`, `api/services/voice/brain/drafts.ts` | `api/services/voice/brain/validator.test.ts`, `api/services/voice/brain/drafts.test.ts` |
| Messages between the app and the server | `contracts/voice-protocol.ts` | `tests/voice-protocol.test.ts` |
| Rebuilt call: what is remembered after a call, and what never is | `api/services/voice/post-call.ts`, `api/services/voice/brain/never-kept.ts`, the `voice_memory_model` setting | `api/services/voice/post-call.test.ts` |
| Rebuilt call: saying a waiting draft is done | `api/services/voice/brain/claims.ts` | `api/services/voice/brain/claims.test.ts` |
| Rebuilt call in the app: when the user is speaking, and what is sent | `src/lib/voice/speech-detector.ts`, `src/lib/voice/downsampler.ts` | `src/lib/voice/speech-detector.test.ts`, `src/lib/voice/downsampler.test.ts` |
| Rebuilt call in the app: the line, resuming a dropped call | `src/lib/voice/call-connection.ts` | `src/lib/voice/call-connection.test.ts` |
| Rebuilt call in the app: what the screen shows, playback, mute, typing | `src/lib/voice/call-controller.ts`, `src/lib/voice/pcm-player.ts`, `src/components/voice/` | `src/lib/voice/call-controller.test.ts`, `src/lib/voice/pcm-player.test.ts` |
| Who sees the ways into the rebuilt call | `src/components/voice/CallSmartButton.tsx`, `src/components/voice/VoiceCallTab.tsx` | |

## Rules for changes here
1. The socket is authenticated only by the session: keep `authenticateUser` before anything that reads user data or
   spends money.
2. Never invent numbers in voice: exact figures come from `finance_query`, never from the model.
3. Actions stay two-step: a draft, then an explicit confirmation. High-risk actions must not run by voice.
4. Never log what the user or the assistant said (golden rule 10 in the root `AGENTS.md`): the handler logs the user's
   id and plan, the type and length of a browser message, the length of the assistant's text and the names of the
   tools it asked for — never a transcript, a reply or a tool's arguments.
5. Session state belongs in Redis; the memory fallback exists for development and single-process setups.

## Tests
The rebuilt call: `api/services/voice/post-call.test.ts` (the rules on what is kept, a summary written and its
words deleted, a call another server took, words already gone, a call with almost nothing said, retries); `api/services/voice/gateway/gateway.test.ts` runs whole calls over a real socket against
`tests/helpers/fake-gemini-live.ts` (a ticket, a tool call, captions, the end card, a ticket used twice, a dropped
call resumed on its handle, a wrong resume token, a socket gone silent, the grace period, the time limit, and
"thinking" held from a tool call until the answer is spoken);
`api/services/voice/engine/gemini-live.test.ts` (setup, key fallback, GoAway, reconnects); the tests in
`api/services/voice/brain/` and `api/services/voice/brain/tools/` (among them the number check leaving an unrelated
figure alone, the profile questions and their answers, the stored reports, and every kind of `money_query`);
`api/services/entitlements/voice.test.ts` and `tests/voice-protocol.test.ts`. In the app, `src/lib/voice/` tests the
resampler (a 12 kHz hiss removed, blocks of any size), the speech detector (pre-roll, pauses, the two hangovers,
the assistant's own voice, a noise that stays), playback, the line (resume with the latest token, giving up, a silent
line, hanging up while connecting) and a whole call through the controller with a fake socket and fake audio. The
microphone, the speaker and the screen are checked by hand in a browser.

`api/services/voice-call-service.test.ts` (tool results, the tool budget, confirmation after the budget is spent),
`api/services/voice-kernel/hot-context.test.ts`, `api/services/voice-kernel/voice-prefetch.test.ts`,
`api/services/voice-kernel/voice-prompt.test.ts`, `api/services/voice-kernel/voice-session-state.test.ts` and
`api/services/voice-kernel/voice-tool-adapter.test.ts`. Nothing tests the WebSocket bridge end to end.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** A call can use one data or draft tool in total, because the voice policy caps tool rounds at one, while the
   system prompt tells the model to call a tool for every exact question: the second such question in a call gets
   `voice_tool_limit_exceeded`.
2. **Bug.** The defaults written in `handleVoiceCallWebSocket` (for example five free minutes a month and a model named
   `gemini-2.5-flash-native-audio-latest`) differ from the defaults in `api/lib/system-settings-registry.ts`, and
   the handler's apply whenever a setting was never saved.
3. **Bug.** The month's allowance adds up every `voice_usage` row of the month, including seconds spent dictating expenses,
   and the month is the server's calendar month rather than Cairo business time (golden rule 6).
4. **Debt.** The model id skips `mapModelName` (golden rule 9): `resolveLiveModelId` only adds a prefix.
5. **Bug.** Usage is written when the call ends; a process that stops mid-call records nothing.
6. **Debt.** The prefetched facts are stored in the session state, but nothing reads them afterwards; the prefetch only warms
   the finance layer's cache.
7. **Debt.** `api/services/voice-context-service.ts#getUserFinancialContextSummary` has no caller, and `ai.runVoiceToolQa` is
   used only by a development query parameter of the call screen.
8. **Bug.** Where `api/boot.ts` serves the web app (the website and the PWA), the old call gets no microphone audio:
   `src/hooks/useVoiceCall.ts` loads its AudioWorklet from a `blob:` URL, and the page's Content-Security-Policy
   (`api/lib/security-headers.ts`, `script-src` without `blob:`) blocks it. The rebuilt call serves its worklet as a file.
9. **Debt.** The old call screen shows its technical "Voice trace" panel to every user
   (`src/components/ai/AIVoiceCall.tsx#VoiceTracePanel`); the rebuilt call shows its trace to admins only.

## Related systems
- [AI Center](ai-center.md): the finance semantic layer, AI memory and action runtime the tools call, and the page
  the call lives in.
- [AI providers and usage limits](ai-platform.md): the cost policy and cost metrics.
- [Accounts, sign-in and security](accounts.md): sessions and the origin policy.
- [Recording spending](expense-capture.md): voice dictation of expenses is a different feature with its own quota
  check.
- [Server platform and data](platform.md): Redis and the settings cache.
