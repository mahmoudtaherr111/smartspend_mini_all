# 0030. Captured payments are recorded on their own only for pairs the admin opens or the user agrees to, filed from the user's own memory

- Status: accepted. Built in `api/lib/capture/memory.ts` (memory and pairs), `api/lib/capture/intake.ts`
  (`mayRecordAlone`, `recordedNotice`, the shared `recordEventInTx`, "undo"), the admin section
  `src/components/admin/settings/AdminCaptureSection.tsx`, tables `capture_memory` and `capture_user_pairs` (migration
  0035).
- Decided and recorded: 2026-10-28, from the capture production plan and the owner's answers (a pair recorded on its
  own with the user's consent after three confirmations; transfers to a person from 1,000 pounds asked first; rows
  recorded on their own do not keep the streak).

## Context
Until now every captured payment waited for the user (decision 0028). Asking about every coffee is tiring, and a
user who confirms the same bank's purchases every day learns to tap without reading. But the reader has been measured
only on messages written for this repository, and a payment recorded wrongly without the user knowing is the one
mistake the owner will not accept. The filing has the same problem: an unknown merchant lands in متنوعات, and the user
fixes it every time.

## Decision
1. **Separate "it happened" from "where it goes".** Recording on its own is about the reading (the amount and the kind);
   the filing may be provisional, marked as such in the notice, and corrected in one tap.
2. **The user's memory comes first.** Where the user filed a merchant (`m:<merchant key>`) or a person
   (`p:<HMAC of the address or name>`, never the name) is remembered from their answers and from editing a recorded
   row's category (the ledger writer teaches it in the edit's transaction). It is per user and never shared. Then the
   subscription catalog, then the kind's default.
3. **Recorded on its own only when all of these hold**: the reading is certain and in pounds; it is not a possible
   duplicate; its bank is not paused (`capture_paused_sources`); its bank and kind are opened for everyone by the
   admin (`capture_auto_pairs`, after the closed beta measures them) or by the user, who is offered it once after
   recording three payments of that pair in a row as they were read; and it is not a transfer to or from a person at or
   above `capture_p2p_ask_above` (1,000 pounds by default), which might be between the user's own accounts.
4. **What the user sees.** A payment recorded on its own comes with a notice "اتسجلت …" and an "undo" button; undo
   deletes the row through the ledger writer, gives the month's count back, and turns the pair back to asking. It does
   not count for the streak; a payment the user records does.
5. **Fewer questions.** At most `capture_daily_question_notices` (2) question notifications a Cairo day; the rest wait
   in the app's list.

## Consequences
- Nothing is recorded on its own until the admin opens a pair or a user agrees to one.
- An undo is not always a reading error (a card shared with family), but it turns the pair back to asking anyway: a
  wrong guess here costs a question, not a wrong row.
- Opening pairs from measured precision automatically, and a breaker that pauses a bank when corrections rise, need
  the closed beta's numbers and come with the next step.
