# 0025. Bank-message model calls go through the admin gateway, redacted, budgeted, switchable and capped in USD

- Status: accepted, implemented in `api/lib/capture/ai-reader.ts#readMessageWithModel` (moved there from
  the old parser on 2026-10-27, when the old ingest route `POST /api/sms/ingest` that called it was
  removed), `api/lib/sms-ai-contract.ts`, `api/lib/anonymizer.ts`, the `sms` purpose in `contracts/ai-models.ts` and
  `src/components/admin/settings/AdminSmsAiSection.tsx`. Nothing calls the model reader until the new intake does.
- Decided and recorded: 2026-10-20.

## Context
When the rule templates could not read a bank or wallet message with confidence, `parseSmsFinancialData` sent it to
Gemini with `GEMINI_API_KEY`, outside every control other model calls go through: the admin could not choose the
provider or the model or switch it off, no plan budget was checked, the tokens never reached the user's budget or the
burst guard, and the text went out as received, with card digits, account numbers, phone numbers and the names of the
people money went to. Egypt's personal data protection law (151/2020) treats financial data as sensitive, and the
model runs abroad. The answer was trusted as returned: an amount the message never contained, a currency word, a
category outside the taxonomy or a declined payment read as spending were saved.

The owner wants templates to read most messages and a model to be a small, controlled fallback for formats nobody has
a template for yet.

## Decision
1. **The admin chooses the model.** `sms` is a purpose the admin assigns in the AI providers screen, like
   classification and chat: any OpenAI-compatible endpoint (OpenRouter with any model, DeepSeek, a custom one) or
   Gemini. The call goes through `resolveAdminRoutes("sms", plan)` and `executeLlmChain`, and the chain is only what
   the admin allowed for that purpose, in their priority order: no built-in provider is added behind it, because the
   admin's choice of who reads bank messages is the point. While nothing is assigned, `GEMINI_API_KEY` with
   `mapModelName("flash")` answers, as before, so production keeps working; it is temporary.
2. **Three gates before any call**, in order: the switch `sms_ai_enabled` (`false` stops every call), the user's plan
   budget (`assertAiBudget` on the `sms` channel, with its burst guard), and a global daily cap in USD,
   `sms_ai_daily_cost_cap_usd` (0 means none): the `sms` rows of the AI cost ledger since Cairo midnight plus the most
   this call could cost at the routes' prices from `api/lib/ai-pricing.ts`. With a cap, a model without a price is
   not called, because its cost could not be counted. A cap that cannot be read counts as reached.
3. **Redaction before the text leaves.** `redactWithFindings` turns card and account digits, IBANs, Egyptian phone
   numbers, reference numbers, e-mail addresses, one-time codes and people's names after من، إلى، لـ، to, from or Dear
   into markers, and keeps amounts, balances, fees, dates and merchants. The last four digits of a card stay on the
   server and are filled into the answer afterwards. One call carries one message of one user; messages of different
   users are never batched into one prompt.
4. **A versioned contract, checked before it is believed.** `SMS_PROMPT_VERSION` names the prompt and the reply shape:
   the kind of message from a closed list, direction (`in`, `out`, `internal`), amount and ISO currency, EGP
   equivalent, fee, balance, counterparty type, rail, category and subcategory from `contracts/categories.ts`, a
   subscription hint and a confidence per field. The closed values are enums in the schema, and zod checks the reply
   whatever the provider honoured: the amount must be written in the redacted text, the currency must be an ISO code,
   the category must be in the list, the direction must fit the kind. A reply that fails is discarded. Declined
   payments, holds, one-time codes and offers are never transactions, and a checked reading of one is not overruled
   by the rules. A foreign amount with no EGP equivalent in the text is not saved as pounds.
5. **Nothing is lost.** When a gate refuses, the call fails or the reply is discarded, the message takes the path it
   took without a model: the rules' reading when it has an amount (`rules_fallback`), otherwise the raw message is
   kept as `ignored` with `model_unavailable`. The reason is stored as `model_outcome`. Over the plan's monthly limit
   messages remain rules-only suggestions (decision 0009).
6. **Recorded like every channel.** Each attempt goes to the AI cost ledger at its provider's price
   (`recordModelCalls`, channel `sms`), and the tokens to the user's running count and an `ai_sms` event
   (`trackAiTokens`), which the monthly budget and the burst guard read.

## Consequences
- Switching the provider, the model, the switch or the cap is a console change; no deploy.
- A free plan's request ceilings now apply to bank messages: the per-request output cap is the plan's
  `<plan>_max_per_request` within the `sms` hard ceiling, and the static prompt is counted as a fixed overhead, as the
  parse channel counts its own.
- The model sees less than before: a merchant written after "from" or من is masked as a name. Privacy comes first;
  templates read most messages anyway.
- The parse cache key holds the prompt version, so changing the prompt or the contract means a new version.
- Still to come in the plan for automatic recording: sending the model's reading to a review box instead of saving it,
  using the category it proposes, reading again the messages kept as `model_unavailable`, and retiring the
  `GEMINI_API_KEY` fallback once the key is a provider row.
