# 0029. One payment, one event: captured signals are merged by rules that never merge on a guess

- Status: accepted. Built in `api/lib/capture/events.ts` (the rules, pure) and `api/lib/capture/intake.ts` (the
  intake on events), table `capture_events` (migrations 0032 and 0033).
- Decided and recorded: 2026-10-28, from the capture production plan (owner, red-team review, a consult with
  Antigravity, decision 0028).

## Context
One payment reaches the server as several signals: the bank's SMS and its app's notification, an InstaPay
notification, the same message from the user's two phones. Asked about each signal, the user would see the same
payment twice; recorded from each, the ledger would count it twice. But two real payments can look alike: two coffees
of the same price minutes apart, the same metro ticket twice, a bank that writes neither time nor balance. A wrong
merge loses a real payment and nobody notices; a duplicate is one tap away.

## Decision
1. **An event is one payment.** Every kept signal belongs to one event; the user is asked about events, and an
   event writes at most one ledger row (`clientRequestId` `cap:e<event>`). A signal that joins an event waiting for
   an answer is answered `merged`; one that joins an answered event is answered with that answer.
2. **The rules, in order** (`matchSignal`): the bank's reference (kept as an HMAC) with the same amount within a day;
   the same words from another of the user's phones within ten minutes; the same words from the same channel within
   five minutes are **not** merged, they start their own event and the user is asked whether it is the same payment;
   another channel with the same money, both directions known, nothing in conflict (a different card on the last three
   digits, a different merchant, a different balance of the same account) within five minutes (fifteen when both
   messages give the same minute), and only if that channel is not on the event yet; the pound posting of a foreign
   charge with the same card and merchant within three days; and a transfer between the user's own accounts when both
   legs say so. Anything else starts an event.
3. **One user at a time.** Each signal is taken in a transaction that first locks the user's account row, so two
   batches arriving together are matched one after the other.
4. **Links are not merges.** A refund is its own negative row in the category of the purchase it returns, found among
   the user's recorded events of the same merchant in the last 90 days (decision 0010); without one it stays income.
5. **The ledger stays the truth; the event is thin.** An event keeps the keys signals are matched on, no message
   text. A ledger row deleted by the user leaves its event as `deleted` (the ledger writer marks it in the deletion's
   transaction), so a late signal of the same payment never brings it back.
6. **Wallets.** A card or account suffix that matches exactly one of the user's wallets records the row on it, and
   the wallet's balance follows the message's when the message is newer than what the wallet holds
   (`balance_source = 'bank_message'`).

## Consequences
- Every rule is a case in `api/lib/capture/events.test.ts`, and the database cases in `tests/capture-intake.test.ts`.
- The windows are guesses until real messages measure them; the closed beta counts merges per rule and the user's
  duplicate answers.
- Holds that settle later, and a question for a transfer that might be between the user's own accounts, come with the
  next steps of the plan.
