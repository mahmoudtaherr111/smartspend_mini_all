# 0049: One capture path: the phone sends on keywords, the model decides, the code keeps it honest

Date: 2026-11-05
Status: accepted; built; production needs the deploy, a provider key with a paid tier, and the SMS declaration

## Context
Eight plans had built capture around a rule reader and gates (decisions 0028 to 0048): a reader of about 2,200 lines
that decided first, an sms-v2 model for what it was unsure of, an sms-v4 contract whose evidence checks were word lists,
and more than ten switches that all had to hold before one payment was recorded on its own. Measured in code:
- every check that read words rejected the next bank's wording; widening the lists to the messages at hand is fitting
  the test, not reading banks;
- automatic recording needed a qualification JSON per bank and kind, tied to a prompt digest, and a catalog source;
  no SMS sender id was registered, so no SMS could ever be recorded on its own;
- the app sent the automatic consent version and the server accepted only the older one, so nobody could consent;
- names were masked before the model, so "to TALABAT EGYPT" reached it as a person and could not be filed.

The models read the messages right: on the owner's real messages the reader got 13 of 20, both models all of them.
The owner's brief (2026-11-04): the phone sends a message that holds one of 31 keywords, the model reads it, and the
person finds it in the ledger with its details, from any bank, with no rule engine and no competing readers.

## Decision
- **The phone's only filter is the owner's keyword list** (`CaptureGate`, the server's `gate.keywords`, the shared
  fixture). The server checks it again and judges everything else: a person's number, a one-time code
  (`looksLikeOneTimeCode`, never stored or sent), the user's ignore list.
- **One path.** Every admitted message is sealed with one model job. The rule reader, the sms-v2 reader, sms-v4, the
  read mode, the per-bank qualification, the source requirement and the admin's auto pairs are removed.
- **sms-v5: the model names labels, never values.** The code labels every amount in the redacted message; the reply
  names which label is the amount, the fee, the balance, the pound value. The checks read no words: the shape (side
  fields degrade to absent), the labels exist, the amount is not the balance, the direction comes from the kind when
  the kind has one. A reply that fails asks the next route.
- **Names reach the model; identifying numbers never do.** Phones, cards, accounts, references, codes, e-mails, IBANs
  and any leftover ten-digit run are masked; shop and people names stay so the model can tell a shop from a person.
  The consent text says so; its version is `2026-11-05` and older grants stop counting.
- **Everything complete is recorded on its own,** with a notice and undo. A possible duplicate, a paused bank, a
  foreign charge without its pound value or a transfer without a direction waits in the app's list. Questions after
  saving are each user's choice (`purpose_questions`), allowed by the admin's switch.
- **Matching:** an SMS sender is matched to a source by registered ids or the source's own names; across channels the
  same money must also name the same card, account or merchant, or the same balance, within minutes.
- **Switches default to on** where the admin has not set them (`capture_enabled`, `capture_questions_enabled`).
- **The ledger cutover runs itself** (`cashflow-cutover` at boot and every ten minutes) and activates only on a clean
  ledger; otherwise it tells the admins. This replaces the "never as part of shipping" line of decision 0045.
- **Proof is measured on messages the prompt was not tuned on:** `api/qa/fixtures/capture-heldout-v9.json` was written
  before the prompt and is never edited to fit; `npm run bench:capture` scores the production path on it or on a
  private file of real messages.

## Consequences
- One path from phone to ledger; about 3,000 lines removed. Results on the frozen set: gemini-3.5-flash-lite 60/60,
  qwen3.8-27b on Groq 60/60, gemini-3.1-flash-lite 57/60 (provider errors and one case since fixed), p50 0.6 to 1.6 s.
- Third parties' names in bank messages go to the model provider under the user's consent: production needs a paid
  tier that does not train on requests, and the lawyer's review under Law 151/2020.
- The phone sends more than before (any message with a keyword from a listed app or SMS); the server stores nothing of
  what it drops. A code the one-time-code rule misses could reach the model.
- iPhone capture and a run on a real phone are still to do; the SMS build waits for Google Play's declaration.
