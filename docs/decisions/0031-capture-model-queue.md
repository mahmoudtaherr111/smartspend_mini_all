# 0031. The model reads captured messages the reader is unsure of, from a queue, with the user's consent, and only asks

- Status: accepted. Built in `api/lib/capture/ai-queue.ts` (the queue and worker, `readingFromModel`,
  `takeCaptureNotices`), `api/lib/capture/intake.ts` (`placeSignal`, the queued path), the route
  `GET /api/capture/v1/notices`, the protected job `capture-ai-sweep`, table `capture_ai_jobs` (migration 0036),
  `NoticeWorker` on Android and the consent switch on the app's capture card.
- Decided and recorded: 2026-10-28, from the capture production plan (P4).

## Context
Until now a message the reader was unsure of was asked about as the reader read it, and one without an amount was
dropped. The model reader (decision 0025) existed but nothing called it. Calling it inside the intake request would
hold the user's lock and the phone's request for the length of a model call (up to fifteen seconds), and a provider
outage would fail the batch.

## Decision
1. **Only with consent.** A signal goes to the model only when the user agreed to `ai_reading` and the admin's switch
   `sms_ai_enabled` is on. Without it, nothing changes: a reading with an amount is asked about, one without is dropped.
2. **A queue, not the request.** The intake keeps the signal (redacted text and the reader's fields) with a row in
   `capture_ai_jobs` and answers the phone `queued`. A worker claims the oldest due job with `FOR UPDATE SKIP LOCKED`
   and a one-minute lease, calls the model outside any transaction, then places the signal under the user's lock as the
   intake would (`placeSignal`: merging, the monthly limit, the question). The request that queued a job wakes the
   worker in its own process; the protected job `capture-ai-sweep` picks up every minute what a restart or a lost lease
   left. MySQL is the truth; Redis is not needed.
3. **The model's reading is a question.** `readingFromModel` takes the kind, direction and amounts from the model and the
   card, account, balance and reference from the reader (taken before redaction), and is always `likely`: it is never
   recorded on its own, but its question has the buttons "record" and "not mine". Nothing counts against the month until
   the model says money moved.
4. **When the model is not used** (switched off, out of budget or cap, consent taken back, three failures, a reply the
   contract rejects), the reader's own reading is asked about when it has an amount; otherwise the signal is dropped.
5. **The question reaches the phone by asking.** There is no push yet: after a batch with a `queued` result the phone
   fetches `GET /api/capture/v1/notices` ten seconds later, and again while some are still being read (five tries); each
   notice is handed out once. What it misses waits in the app's review list.
6. **The message reaches the model as one JSON string** (`SMS_PROMPT_VERSION` `sms-v2`), so quotes or a line that
   reads like an instruction inside a message cannot end it.

## Consequences
- An unclear message costs one model call of the user's `sms` budget and is asked about within seconds instead of being
  lost.
- Without push, a question the phone did not fetch within about a minute shows only in the app; a push channel needs a
  Firebase project of the owner's and is left for later.
- Old phones that do not know `queued` treat it as final, as they treat every unknown result; they never fetch notices.
