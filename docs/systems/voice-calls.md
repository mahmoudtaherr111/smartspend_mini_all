# Live voice assistant

The live voice call in the AI Center: the browser streams the user's voice over a WebSocket, the server bridges it
to the Gemini Live API with a short financial context and a small set of tools, streams the assistant's voice
back, enforces the plan's call minutes, and archives the call into the user's AI memory.

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

## The rebuilt call (in progress, not yet reachable)
The call is being rebuilt beside the one above; nothing routes users to it yet. What exists so far:
- **Who may call, for how long, on which model.** `api/services/entitlements/voice.ts#getVoiceEntitlements` returns
  one typed object: whether the plan may call (`voice_call_enabled_<plan>`), minutes a month
  (`voice_call_limit_<plan>`), seconds a call (`voice_call_duration_<plan>`), the model (`voice_v2_model_<plan>`,
  else `voice_v2_model`, default `gemini-3.8-live`), the thinking level for the extended-thinking model, a daily
  provider-cost cap in USD (`voice_daily_cost_cap_usd_<plan>`), and whether this user gets the new call: staff and
  the users in `voice_v2_allowlist` always, others when their stable bucket falls under
  `voice_v2_rollout_percent`; `voice_v2_kill_switch` stops it for everyone. Usage is the Cairo month's
  `voice_calls.billed_seconds` plus the old call's `voice_usage` rows (source `gemini_voice_call`), never
  dictation seconds.
- **Where calls are counted.** `voice_calls` holds one row per call (status, engine, model, billed seconds,
  tokens by modality and cost in USD) and `voice_call_incidents` the structured problems of a call; neither holds
  anything that was said. Account deletion removes both; retention keeps calls a year and incidents ninety days.
- **How numbers are said.** `api/services/voice/brain/spoken.ts` writes the Egyptian spoken form of an amount
  ("تمن آلاف وربعمية", "حوالي خمستاشر ألف", "ألفين ونص"), the rounding a spoken answer may use
  (`roundForSpeech`), shares ("ربع") and days ("كمان تسع أيام"). Every form parses back to its value through
  `api/lib/arabic-number-parser.ts`, which the spoken-number check will use.
- **The wire protocol** between the app and the coming socket `/api/voice/v2`: `contracts/voice-protocol.ts`.

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
The rebuilt call: `api/services/entitlements/voice.test.ts`, `api/services/voice/brain/spoken.test.ts` and
`tests/voice-protocol.test.ts`.

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

## Related systems
- [AI Center](ai-center.md): the finance semantic layer, AI memory and action runtime the tools call, and the page
  the call lives in.
- [AI providers and usage limits](ai-platform.md): the cost policy and cost metrics.
- [Accounts, sign-in and security](accounts.md): sessions and the origin policy.
- [Recording spending](expense-capture.md): voice dictation of expenses is a different feature with its own quota
  check.
- [Server platform and data](platform.md): Redis and the settings cache.
