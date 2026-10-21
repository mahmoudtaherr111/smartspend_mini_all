# 0026. Bank and wallet messages are read by code first; the model reads only what the code is unsure of

- Status: accepted. Built in `api/lib/capture/reader/` (the reader, its corpus and benchmark, `npm run bench:capture`).
  Not yet connected to message intake: the old intake is being removed and the new one (signals, events, Android
  capture) follows, per the capture plan.
- Decided and recorded: 2026-10-20.

## Context
The old intake read messages with a rules parser that knew about nineteen providers by regular expressions, never
extracted a merchant, a fee, a card or a currency other than pounds, misread English words ("between" as WE Pay),
recorded declined payments, and sent everything else to a model. A model per message costs money, sends financial
text abroad, answers differently for the same message, and reported its own confidence. Competing Egyptian apps send
every message to a model.

The messages themselves are regular: a bank writes the same few shapes with different numbers, in Arabic or English.
What needs care is the details: the available limit next to the amount, an amount in dollars with or without its
pound value, ".93" without a leading zero, a date without a year, a card suffix of three or four digits, a person's
name or number after "إلى"/"من", a footer that says "لا تشارك" in a real purchase, a promotion that says "خصم".

## Decision
1. **Two layers.** Code reads every message first (layer one). Only a reading the code calls `unsure` goes to the
   model (layer two: the admin's provider, redacted text, budget and validation, decision 0025). Both answer in one
   shape, `Reading` (`api/lib/capture/reader/types.ts`), so nothing after them cares who read.
2. **The reader is one pure function**, `readMessage`: no database, network or clock. It normalizes the text into two
   views with a map back to the original, finds typed pieces (money, card, account, phone, InstaPay address, date,
   time, reference, one-time code, link, percentage), finds the words of a bilingual lexicon (each with an id), cuts
   sentences, decides the kind and direction, gives every amount a role (amount, balance, limit, fee, minimum due,
   pound equivalent), finds the other side and dates the message in Cairo time.
3. **It says how sure it is and why.** `certain` only when every field the kind needs came from a clear word and the
   currency is written; `likely` when something was assumed; `unsure` on conflict or doubt. Every reading carries its
   evidence (word, piece, rule, position), used to explain it to the user and later to learn templates.
4. **Messages that are not transactions are recognised before money words**: a one-time code, a declined payment, a
   hold, a promotion, a statement, a balance, an account notice.
5. **Measured, not assumed.** A benchmark corpus of messages written for this repository in the shapes banks send
   (CIB, NBE, Arab Bank, wallets, InstaPay, ATM, salary, bills, refunds, non-transactions) fails the build if any
   field falls under its floor or if the reader is ever certain and wrong. Real messages join it with their numbers
   changed. Nothing is recorded without asking for a kind until it is near-perfect on the corpus.
6. **Templates come later, above the reader**, from shapes it reads with certainty or the admin approves; the reader
   must stand on its own.

## Consequences
- Most messages cost nothing to read and never leave the server; the model's share is measured and should fall.
- The corpus is written by us, so it shows what the reader handles, not every bank's real wording; real samples
  (Banque Misr, QNB, Banque du Caire, wallets, InstaPay notifications) are still needed and will find gaps.
- Kinds and directions are the AI contract's (`api/lib/sms-ai-contract.ts`); moving that vocabulary into
  `contracts/capture.ts` waits for the old intake's removal, which touches the same file.
