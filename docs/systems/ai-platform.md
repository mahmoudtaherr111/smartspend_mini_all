# AI providers and usage limits

Everything between "this feature needs a model" and a provider's HTTP endpoint: which provider and model serve
a request, the chain that takes over when one fails, the circuit breaker that stops asking a dead provider,
the per-plan token budget every paid call is measured against, and the two places a call is recorded.

- Facts generated from the code, with diagrams: [docs/atlas/systems/ai-platform.md](../atlas/systems/ai-platform.md)
- The same story for readers who do not read code: [docs/ar/systems/ai-platform.md](../ar/systems/ai-platform.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Admin routes | `api/lib/ai-gateway.ts` | Reads `ai_providers` and `ai_models` into a per-process cache, opens the keys (moving any on an older secret to the current one), and answers "which provider and model did the admin pick for this purpose and plan" |
| Provider keys | `sealProviderKey` and `openProviderKey` in `api/lib/provider-key-crypto.ts` | AES-256-GCM over the keys stored in `ai_providers`, sealed with `AI_GATEWAY_SECRET` (or `JWT_SECRET` while it is unset) and opened with any secret the server still holds |
| Model discovery | `discoverRemoteModels` in `api/lib/ai-gateway.ts` | Asks a provider for the models a key can reach ([admin](admin.md)) |
| Provider chain | `api/lib/llm-provider-chain.ts` | Builds the ordered list of routes: the admin's rows first, then every built-in provider whose key is present |
| Router | `api/lib/llm-router.ts` | Sends the request, classifies the failure, moves to the next route, opens the breaker, and reports what every attempt cost |
| Provider health | `api/lib/provider-health.ts` | Writes what the breaker learns into `ai_providers.healthStatus`, at most once a minute per provider |
| Model names | `api/lib/model-mapper.ts` | Maps shorthand and retired names, tells a provider's models apart, and gives each provider a default per plan |
| Model catalogue | `api/lib/ai-provider-registry.ts` | A hand-written list of models with tiers, purposes and prices, plus the retired-name map |
| Legacy routing | `resolveRoutingConfig` in `api/ai-router.ts` | The older path: routing ranges and keys read from `system_settings` by how many tokens the user has spent |
| Budgets | `api/lib/ai-usage-policy.ts` | Per-plan monthly limits, per-request ceilings, the burst guard, and the token estimate |
| Cost metrics | `api/services/ai-cost-policy.ts`, `api/services/ai-cost-analytics.ts` | A second, lighter accounting of AI work as `ai_cost_*` events, and the admin overview over them |
| Provider clients | `api/lib/deepseek-client.ts`, `api/lib/fireworks-client.ts`, `api/lib/nvidia-client.ts`, `api/lib/groq-client.ts`, `api/lib/fireworks-embedding-client.ts` | The direct calls still used by the AI Center, the report job and the embedding engine |
| Limits for the app | `ai.getUserLimits` in `api/ai-router.ts` | What the user has left this cycle: AI tokens, voice seconds and offline items (`offline_limit_<plan>`) |

## Choosing a provider
1. The caller asks for a purpose and a tier. `resolveAdminRoutes` returns the model the admin marked as the
   default for that pair, plus every other model allowed for that purpose as fallbacks, ordered by
   `ai_providers.priority`. A route whose key no configured secret opens is left out instead of being tried,
   and says so (see Provider keys).
2. `buildProviderChain` puts the requested provider first, then the admin's other rows, then a second Gemini
   key, then every built-in provider that has a key (Gemini, Groq, Fireworks, NVIDIA), then DeepSeek and
   OpenRouter if they have one. A route needs both a key and a model to stay in the list, and a model that
   demonstrably belongs to another vendor is replaced by that provider's default.
3. `executeLlmChain` tries the routes in order under one deadline for the whole chain. Gemini goes through the
   Google SDK; everything else speaks the OpenAI-compatible shape, which is why adding a provider is a row and
   a key rather than code.

The Gemini text models this app uses are `gemini-3.8-flash`, `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`
(`GEMINI_TEXT_CHAIN` in `api/lib/model-mapper.ts`, strongest first; all three answered on Google's API on 2026-09-24).
Google does not serve `gemini-3.1-pro` (it answers 404), so that name, the older Pro names and the `pro`/`ultra`
shorthand map to `gemini-3.8-flash`, which is also Ultra's default. `executeAiGateway`, which the voice call's `think`
tool uses, takes the model named in `forceModelId` (the admin's model by that id, else that Gemini model), else the
admin's route for the purpose and plan, else Gemini with the plan's default (`defaultGeminiModelForPlan`:
`gemini-3.8-flash` for Ultra, `gemini-3.1-flash-lite` otherwise), and passes a Gemini id through `mapModelName`. When
Google answers 429 (a model's quota spent), 500 or 503 (overloaded), or an attempt runs past the caller's
`attemptTimeoutMs`, it tries the next model of `geminiFallbackChain`, lighter ones first and then the stronger ones
nearest first, and logs `ai_gateway.model_overloaded`. A Gemini answer's thinking tokens are counted as
`reasoningTokens`. With `deadlineMs` it stops once less than half a second of the
budget is left. The voice call's post-call summary and price lookup use the same chain through
`api/services/voice/text-model.ts`.

## Provider keys
- The admin console saves a provider's key sealed with AES-256-GCM under SHA-256 of `AI_GATEWAY_SECRET`, or of
  `JWT_SECRET` while that is unset (`api/lib/provider-key-crypto.ts`). The stored shape, `<iv>:<tag>:<data>`, is
  the one earlier versions wrote, so a rollback reads what this version writes.
- A stored key is opened with `AI_GATEWAY_SECRET`, then `AI_GATEWAY_SECRET_PREVIOUS`, then `JWT_SECRET`; GCM's
  tag makes a wrong secret fail rather than return noise. A value with three colon-separated parts is treated as
  sealed, so a damaged one is never sent to a provider as its key; anything else predates sealing and is read as
  it is.
- Loading the providers — at boot, then whenever the route cache is older than a minute or an admin saves one —
  reseals every key, active or not, that opened with an older secret or was stored as plain text, with a write
  that lands only if the stored value is unchanged. Setting `AI_GATEWAY_SECRET` and deploying therefore moves
  every key to it. A rotation is: the old value into `AI_GATEWAY_SECRET_PREVIOUS`, the new one into
  `AI_GATEWAY_SECRET`, deploy, and remove the old value once no key shows it.
- A key none of them opens stays stored and is left out of routing; it is logged once per process
  (`ai_gateway.key_unreadable`) and shown on the provider's card, where the admin can enter it again without
  deleting the provider ([admin](admin.md)). In production without `AI_GATEWAY_SECRET`, each process warns once
  that the keys are sealed with `JWT_SECRET` (`ai_gateway.sealed_with_jwt_secret`).

## When a call fails
- Failures are classified: rate limited, auth, unsupported schema, server, timeout, network, empty response,
  truncated. Everything but "unsupported schema" moves to the next route; an unsupported schema is retried
  once on the same route without the schema.
- The breaker is per route (provider plus model), opens after three failures — or immediately on an auth
  failure — and stays open for a minute, ten minutes for an auth failure, or for as long as the provider's
  `Retry-After` says, up to thirty minutes. One shut-out route is probed per request, behind every route that
  is still believed in, so a recovery is noticed without paying for every dead provider.
- Each attempt's tokens are added up, including the failed ones, so `attemptTotals` is what the request really
  cost while the top-level numbers describe the call that answered.
- A reply the provider cut short (`finish_reason: "length"`, or Gemini's `MAX_TOKENS`) is a failure, not an
  answer, because the parser cannot tell a truncated JSON object from an invalid one.

## Budgets and limits
- `assertAiBudget` runs the burst guard, resolves the budget, and refuses the call when the plan has no
  allowance for that channel, when the input alone exceeds the hard ceiling, or when the monthly limit is
  used up. Callers then shrink the output with `clampOutputTokens`.
- The monthly limit is `<plan>_token_limit` in the settings (50,000, 500,000 and 2,000,000 by default), and a
  `user_token_limit_<type>_<id>` setting overrides it for one person ([admin](admin.md)).
- The per-request ceiling is the admin's `<plan>_max_per_request` (or the report, image and goal settings),
  and then a hard ceiling per plan and channel in the code that the admin's value can only lower.
- The burst guard refuses more than the plan's `burst_limit_per_minute_<plan>` calls of one channel per minute (20, 60
  and 100 by default, editable in the console, `contracts/plan-features.ts`), counted from
  the `ai_<channel>` events of `user_analytics`.
- Tokens are estimated from the text before the call — Arabic letters count heavier than Latin ones — and the
  provider's own numbers replace the estimate afterwards.

## How a call is recorded
There are two accountings, and they do not cover the same calls:
- `trackTokens` in `api/ai-router.ts` adds the tokens to `users.ai_tokens_used`, records an `ai_<channel>`
  event, and writes a row in `ai_token_ledgers`. It runs for `ai.parseExpense`, `ai.speechToText`,
  `ai.parseVoiceExpense` and `ai.generateMonthlyInsights`. The admin telemetry and quota screens read this
  table ([admin](admin.md)).
- `recordAICostMetric` writes an `ai_cost_*` event into `user_analytics` with tokens, latency, route and
  fallback flags. The AI Center chat, the voice call service, the monthly report job and the action runtime
  use it, and `loadAICostOverview` aggregates it for `admin.getAICostOverview`.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Which provider serves a purpose and plan | the admin console: providers, models and their purposes ([admin](admin.md)) | `api/lib/admin-model-switch.test.ts` |
| The order and contents of the fallback chain | `api/lib/llm-provider-chain.ts` | `api/lib/provider-route-acceptance.test.ts` |
| Retries, the breaker, timeouts, failure classes | `api/lib/llm-router.ts` | `api/lib/llm-router.test.ts` |
| A model name, shorthand or per-plan default | `api/lib/model-mapper.ts` | `api/lib/model-mapper.test.ts` |
| Plan limits and per-request ceilings | the settings, then `api/lib/ai-usage-policy.ts` for the hard ceilings | |
| Which route classification takes per plan | `api/lib/ai-routing.ts` | `api/lib/ai-routing.test.ts` |
| How provider keys are sealed, and which secrets open them | `api/lib/provider-key-crypto.ts`, `AI_GATEWAY_SECRET` in `api/lib/env.ts` | `api/lib/provider-key-crypto.test.ts`, `api/lib/provider-key-reseal.test.ts` |

## Rules for changes here
1. Model ids go through `mapModelName()` (golden rule 9), and a provider's model through
   `coerceModelForProvider`.
2. Before paying for a model call, check the budget with `assertAiBudget`; record the tokens afterwards
   (`api/AGENTS.md`, rule 5).
3. Adding a provider should stay a row plus a key: keep new provider behaviour behind `baseUrl` and the
   OpenAI-compatible shape instead of a new client file.
4. The route cache and the breaker are per process (`api/AGENTS.md`, rule 6): never assume one replica's view
   of a provider is another's.
5. Store a provider key only through `sealProviderKey` and read it only through `openProviderKey`; never log a
   key, and never change the stored shape without a way for the previous version to read it.

## Tests
`api/lib/llm-router.test.ts`, `api/lib/provider-route-acceptance.test.ts`, `api/lib/admin-model-switch.test.ts`,
`api/lib/ai-routing.test.ts`, `api/lib/model-mapper.test.ts`, `api/services/ai-cost-policy.test.ts` and
`api/services/ai-cost-analytics.test.ts`; the provider keys in `api/lib/provider-key-crypto.test.ts` and
`api/lib/provider-key-reseal.test.ts`.

## Known issues
Checked against the code; each one names where it lives.
1. **Debt.** `executeAiGateway` — the execution half of the "universal gateway", with its own price-based cost
   calculation and ledger write — has one caller, the rebuilt voice call's `think` tool. Elsewhere only its route
   resolution is used, by `api/lib/smart-pipeline.ts`.
2. **Bug.** Cost in `ai_token_ledgers` is not the model's price: `trackTokens` bills every call at 0.14 USD per million
   tokens and converts at a fixed 50.5, while the settings hold an exchange rate that only the unused gateway
   reads. The admin's cost and telemetry screens show those numbers.
3. **Bug.** The two accountings leave gaps: the AI Center chat and voice calls never reach `ai_token_ledgers`, so the
   telemetry tab under-reports them, and the screen that would show the `ai_cost_*` side is not mounted
   ([admin](admin.md)).
4. **Debt.** `api/lib/ai-provider-registry.ts` carries a model catalogue with tiers, purposes and prices, "last verified"
   in a comment, and nothing reads it: `isKnownModel`, `getModelEntry`, `listModels`, `resolveApiKey` and the
   per-plan defaults have no caller, and only `DEPRECATED_MODEL_MAP` is used. Model defaults live a second
   time in `api/lib/model-mapper.ts` and a third time in the fixed lists of `admin.getAvailableModels`.
5. **Bug.** The legacy path is still the one most traffic takes: `resolveRoutingConfig` reads `free_routing_ranges` and
   `pro_routing_ranges` from the settings, so an Ultra user is routed by the Pro ranges, and the keys come from
   settings or the environment rather than from the providers the console manages.
6. **Debt.** The breaker, the route cache (one minute) and the settings cache (five minutes) are per process, so during
   an outage each replica learns on its own and an admin's change reaches them at different times.
7. **Bug.** `ai.getUserLimits` computes the billing cycle with server-local `Date` arithmetic instead of Cairo business
   time (golden rule 6), so the cycle turns over at the server's midnight.
8. **Debt.** The token estimate exists twice with the same formula, in `api/lib/ai-usage-policy.ts` and
   `api/lib/ai-gateway.ts`, and the burst guard only sees channels that call `recordAiUsageEvent` — the chat,
   report, SMS and voice paths do not.
9. **Gap.** `admin.checkProviderHealth` has no screen, so `ai_providers.healthStatus` — the dot on each provider's card —
   is only ever written by the breaker during real traffic ([admin](admin.md)).

## Related systems
- [Recording spending](expense-capture.md): the classification pipeline, the biggest caller of the chain.
- [AI Center](ai-center.md) and [Live voice assistant](voice-calls.md): the chat and the call, which account
  for their work with cost events.
- [Reports, insights and the smart profile](insights.md): the report and insight calls.
- [Admin console, support and growth tools](admin.md): providers, models, keys, quotas and telemetry.
- [Plans and payments](billing.md): the plan a budget is resolved from.
- [Server platform and data](platform.md): settings, environment variables and the database.
