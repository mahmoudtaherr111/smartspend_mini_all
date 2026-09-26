# Voice quality lab

The lab in `scripts/voice-lab/` measures the Gemini Live provider with synthetic users and financial fixtures.
It never authenticates to SmartSpend, reads its database, executes ledger actions or records microphone audio.
It does not certify the application's call implementation, payment flow or launch readiness.

## Offline coverage

Run `npm run qa:voice:prepare`. It writes the generated Egyptian Arabic cases, their expected policies and
multi-turn scripts to an ignored JSON report under `.agents/`. The cases cover understanding spending, recording,
closing a day, purchase decisions, the application guide and emotional support. Every case is labelled
`synthetic_template` and `humanReviewed: false`; changing amounts or wording is not another human speaker.
The generated report includes failed release checks until real evidence is supplied.

## Provider measurements

Set `GEMINI_API_KEY` in the local environment or the ignored `.env` file. These commands spend real provider
credit. Each session is limited to ten synthetic turns, a per-turn deadline, a session deadline and a tool
budget; a provider rejection or premature closure returns a nonzero exit code. Do not put credentials on the
command line.

```sh
npm run qa:voice:live -- --turns=4 --rates=scripts/voice-lab/rates.2026-09-22.json --json=.agents/reports/voice-lab/live.json
npm run qa:voice:live -- --model=gemini-3.8-live-extended-thinking --turns=4 --rates=scripts/voice-lab/rates.2026-09-22.json --json=.agents/reports/voice-lab/thinking.json
npm run qa:voice:compare -- --turns=3 --rates=scripts/voice-lab/rates.2026-09-22.json --json=.agents/reports/voice-lab/audio.json
```

The first two commands send text and receive audio. The comparison synthesizes speech once and streams the
same PCM bytes at real-time speed to both models, with explicit activity start/end. Its default TTS model is
`gemini-3.1-flash-tts-preview`; `--tts-model` can select another accessible TTS model. Synthesis is held only in
memory and its cost is excluded from the Live measurements. If synthesis fails, the report names the failed
turn and records any available partial comparison; it never retries a quota rejection automatically.

The lab requests input/output transcriptions and session resumption updates. It measures whether the updates
arrive, not whether reconnection works. Standard sessions wait for `turnComplete` and tool-answer audio;
thinking sessions wait for `interactionStatus: IDLE`, including the nested `serverContent` form observed on
the wire. `generationComplete` alone does not advance the script. A quiet drain keeps trailing usage and
transcription events attached to their turn. The lab does not test interruptions or reconnects yet.

`--compression` enables a sliding context window. The text runner accepts `--trigger-tokens` and
`--target-tokens`; the comparison uses the same window for both models. Enabling compression in a short
session does not demonstrate that compression actually triggered.

## Reading the report

Reports are JSON under `.agents/`. They contain only synthetic transcripts, token observations, durations,
protocol event field names and source-labelled rate inputs. The terminal prints summary metrics, never a
transcript, secret, provider payload or audio data. Raw audio and resumption handles are not saved.

- `firstAudioP95Ms` is a sample percentile measured on the lab machine. For speech it starts at the end of the
  streamed input; for text it starts when the text was sent. Neither is a mobile-network benchmark.
- PCM byte counts determine input and output audio duration. The sum is audio activity duration, not elapsed
  call time. Silence, setup time and synthetic speech generation are different measurements.
- Every usage event is retained, including separate tool-call generations. Missing usage is unknown, never
  zero. Repeated or multiple events are not silently treated as independent invoices.
- `sumOfReportedModalitiesUsd` prices the visible modality counts. It is diagnostic, not a total charge or a
  per-minute commercial price. Unknown modalities, thought/transcription tokens, cache details and differences
  between total and modality counts can leave the full cost unresolved.
- `estimatedSessionUsd` and `estimatedUsdPerAudioMinute` stay null when accounting is incomplete or ambiguous.
  Even a complete estimate should be reconciled against provider billing before setting a commercial limit.
- The dated rates file is an explicit laboratory input. It is not an application price, entitlement or fallback.
  Check the provider's current price page before reusing it.

Google documents that the active context, including retained audio, is billed again on each turn. Prompt
growth is useful corroboration, but cannot prove a charge on its own. See
[billing mechanics](https://ai.google.dev/gemini-api/docs/live-api/best-practices#pricing-and-billing),
[token fields](https://ai.google.dev/api/live#UsageMetadata),
[prices](https://ai.google.dev/gemini-api/docs/pricing), and
[thinking lifecycle](https://ai.google.dev/gemini-api/docs/live-api/thinking).
Gemini's transport uses PCM; an Opus mobile transport would need a gateway codec, not a MIME-type substitution.
See [audio formats](https://ai.google.dev/gemini-api/docs/live-api/capabilities#sending-audio).

## Release evidence

`scripts/voice-lab/gates.ts` evaluates supplied evidence, and refuses provider-only runs, missing safety or
cost measurements, missing journey results and absent human speech evaluation. It requires the application's
six-journey success rate, no invented numbers or unintended writes, the latency target, and the cost cap supplied
by the administrator. It also requires human clips/speakers, reviewed Egyptian speech and an interruption test.
This is an evidence checker, not a deployment switch; callers must supply independently verified observations.

Synthetic conversations do not count as a completed application task or as human diversity. The lab's finance
and guide tools are fixtures. In particular the guide fixture is not the application's approved site guide, and
there is no write tool; these cannot establish expense classification, consent, payment or idempotency correctness.

## Maintaining the lab

```sh
npx vitest run tests/voice-lab.test.ts tests/voice-lab-session.test.ts
npx tsc -p scripts/voice-lab/tsconfig.json
npx eslint scripts/voice-lab tests/voice-lab.test.ts tests/voice-lab-session.test.ts
```

These tests cover the protocol boundaries, late metadata, tool-answer sequencing, timeouts, failed sessions,
audio versus text pricing, incomplete accounting, synthetic corpus coverage and fail-closed release evidence.
