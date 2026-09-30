# 0016. The coach call: the live model reasons, the app computes and writes, behind a rollout

- Status: accepted, implemented in `api/services/entitlements/voice.ts` (who gets it),
  `api/services/voice/brain/coach-instructions.ts`, `api/services/voice/brain/tools/calculate.ts` and
  `COACH_TOOLS` in `api/services/voice/brain/index.ts`; the rollout is at 0 until the call passes its qualification.
- Decided and recorded: 2026-09-29. Point 2 amended by [0017](0017-ultra-thinking-mode.md): the coach talks on the plan's
  model, and its model and level became the Ultra Thinking mode the user switches to.

## Context
The standard call answered questions and recorded expenses, but judged hard questions through `think`: a fast text
model given the user's numbers, whose output was screened by a list of every number reachable in one arithmetic step.
That screen let unrelated products through (pounds times pounds), refused correct two-step answers, and left the
verdict unchecked. The owner wants a coach that understands everyday Egyptian speech, keeps a conversation going and
helps the user reach one step they chose, on `gemini-3.8-live-extended-thinking` at a HIGH thinking level — a quality
target, not a proven result: earlier probes of that model were mixed, including spoken failure claims with no failing
tool.

## Decision
1. The coach is a profile of the same call, not a new call: same socket, gate, drafts, cost and memory. A user gets it
   from an allowlist of `type:id` pairs or a rollout percent over a stable hash of the user; nobody by default.
2. Its model and thinking level are its own settings. It is never moved to the standard model or a lower level to save
   cost or hide a failure; an unreachable model ends the call with the provider error.
3. The live model does the understanding, planning and talking. Arithmetic is `calculate`: Decimal steps over fact
   refs, earlier steps, counts and the user's own amounts, with units that refuse meaningless combinations. `think` is
   not offered to the coach.
4. Figures read before the records changed during the call are marked out of date, the model is told, and saying one is
   recorded (not silently allowed, not blocked: it was true when read).
5. The app's notes to the model carry a per-call tag the user never sees, and wait until the model is idle; only a
   correction of what is being said interrupts.

Rejected: rewriting the call around a text model with speech in and out (loses Live's natural turn-taking and doubles
latency); keeping `think` with a wider number screen (a screen cannot prove what a number means); switching the model
per turn (the thinking level is a session setting).

## Consequences
The coach's quality has to be shown before users get it: an offline suite for the money, consent and ownership rules,
and a multi-turn evaluation against the real model with HIGH compared to MEDIUM and LOW under the same conditions.
Cost is measured per call from its tokens, thinking included, and shown per profile and level in the admin dashboard.
