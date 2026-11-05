# 0048: Direct SMS in its own build, redacted samples, and sms-v4 checks fitted to real model replies

Date: 2026-11-04
Status: partially superseded by [decision 0049](0049-one-capture-path-model-decides.md): sms-v4 was replaced and capture switches default on. The separate SMS build and consented samples remain; check deployment settings for their current state.

## Context
The owner chose to read bank SMS directly with Google Play's "SMS-based money management" declaration (plan v6),
which reverses the "no SMS permissions" line of [decision 0022](0022-flutter-mobile-app.md). The owner also asked
to keep redacted messages to build a reader that needs no model later (plan v7 §8); the v8 plan had dropped it.

The first live run of sms-v4 on invented messages (gemini-3.1-flash-lite, gemini-3.5-flash-lite and
qwen3.8-27b on Groq) found three defects no test with a stubbed provider could:
1. Gemini answered 400 to the Zod JSON Schema (`$schema`, `additionalProperties`, `anyOf` with null), and the chain
   silently retried with no schema at all: numbers came back as strings and kinds were invented.
2. Groq answered 400 to `chat_template_kwargs`, so every reasoning model on Groq failed.
3. The models read kind, amount and counterparty right, but the evidence checks rejected 13 of 14 messages: word
   lists missed how Egyptian banks write ("سحب نقدي" without "تم", "تم رد"), a pattern was spelled with ى against
   text folded to ي, a balance without a currency failed the whole reading, and the prompt left "ownership" open to
   reading the user's own card as an own-account transfer.

## Decision
- **SMS build.** The receiver lives in the `bank_capture` plugin; only the module
  `mobile/packages/bank_capture/android-sms`, added by `-Psmartspend.sms=true`, declares `RECEIVE_SMS`,
  `READ_SMS` and the receiver. The default build is unchanged and requests no SMS permission. Parts of one SMS are
  joined; the sender is the network's originating address. While SMS arrive directly, the notification listener
  ignores messaging apps. An inbox import queues the last 30 days at most (what the server keeps), after live
  messages, marked `imported`, and the server records it without a phone notice. The SMS build is not published
  before Play approves the declaration.
- **Samples.** `capture_samples` keeps the numbered-marker text the model saw, its reply and the posting, only with
  the admin switch `capture_samples_enabled` (default off) and the user's `message_samples` consent. Taking the
  consent back, the capture data wipe and account deletion delete them. Kept 365 days until the lawyer sets the
  period. The user's final answer is read from the event and ledger row at export time, not copied.
- **Provider dialects.** JSON Schema documents are converted to Gemini's schema subset; hand-written Gemini schemas
  pass unchanged. Groq gets `reasoning_effort: "none"` for Qwen and `reasoning_format: "hidden"` otherwise.
- **Checks.** State, amount, direction and fee stay strict: a failed check rejects the reading. Balance, limit and
  ownership fail soft: an unproven one is dropped (`repairs`) and the movement is still read. A transfer's direction
  may be proven by the preposition before its counterparty marker. A purchase or salary needs no direction quote,
  but a quote that contradicts its direction still rejects. The prompt now says what ownership means and that role
  quotes carry their role word.
- **Matching.** A reversal or refund never merges with a payment as its other leg or by repeating its reference.
  Reads still waiting for missing evidence are kept 30 days, like their signals.

## Consequences
The prompt digest changed, so any `capture_model_qualified` value must be produced again. Live accuracy on
invented messages is not qualification: the private golden set and two paid providers remain the gate before any
automatic recording. The Kotlin side compiles in CI; nothing has run on a real phone.
