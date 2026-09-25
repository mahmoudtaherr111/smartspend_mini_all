# 0009. Bank messages over the monthly limit are kept as suggestions

- Status: accepted, implemented in `api/sms-router.ts` (`POST /api/sms/ingest`), `api/services/sms-ledger.ts`, the
  suggestion procedures in `api/profile-router.ts` and `src/components/bank-sync/SmsSuggestionsCard.tsx`.
- Decided and recorded: 2026-09-24.

## Context
Each plan saves a number of bank messages a month on its own (`sms_limit_<plan>`, five on the free plan by
default). A message past that number was refused with 403 and not stored. The Android companion app queues a failed
send and drops it when a retry is refused, the iPhone Shortcut shows nothing, and the web app never told the user.
So from the sixth message of the month a free user's spending silently stopped reaching the ledger while they
believed the connection worked.

Card payments were also filed from a fixed map: every card payment was تسوق/عام, a ride or a meal included.

## Decision
1. A message over the limit is stored and read by the rules parser only; no model is called for it. When the rules
   find a transaction, it is kept in `raw_sms_events` with status `suggested` and a suggestion in its metadata
   (amount, direction, category, provider, merchant, time). When they do not, it is `ignored` as before.
2. The route answers 200 with `saved: false, suggested: true`, so the phone treats the message as delivered.
3. The home screen lists the suggestions. Saving one (`profile.confirmSmsSuggestion`) writes the expense in one
   transaction with its rollup delta, with the category the user kept or picked; `profile.dismissSmsSuggestion`
   drops it. A suggestion moves out of `suggested` only once, so a second tap saves nothing.
4. Only messages saved automatically count toward the limit (`processed`); a confirmed suggestion is the user's own
   entry. The month is the Cairo month.
5. A card payment to a merchant the classification engine knows well (a brand in the merchant registry, the synonym
   graph or the dictionary) takes that merchant's category; anything else keeps the fixed map.

## Consequences
- The plan limit now separates saving automatically from saving at all: the admin's number bounds the automatic
  saves and the model calls, and a user past it loses nothing.
- Statuses of `raw_sms_events`: `pending`, `processed`, `ignored`, `suggested`, `confirmed`, `dismissed`.
- A suggestion is not in the ledger until confirmed, so totals and reports do not count it.
- The duplicate check runs before the limit, so a message sent twice is neither saved nor kept twice.
