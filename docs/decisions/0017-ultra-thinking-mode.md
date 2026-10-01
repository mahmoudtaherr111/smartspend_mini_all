# 0017. Ultra Thinking: a mode the user switches to, on the extended model at LOW, off until qualified

- Status: accepted, implemented in `api/services/entitlements/voice.ts` (who is offered it),
  `api/services/voice/gateway/call-session.ts#switchMode`, `api/services/voice/gateway/lost-call-guard.ts`,
  `api/services/voice/gateway/admission.ts` and `src/components/voice/VoiceCallScreen.tsx`. Every plan's
  `voice_ultra_enabled_<plan>` is off until the mode passes its qualification. Amends 0016: the coach no longer runs on
  its own model; its model and level are Ultra Thinking's.
- Decided and recorded: 2026-09-30.

## Context
The owner asked to qualify `gemini-3.8-live-extended-thinking` at LOW on the existing free key and, if it only turns
out slower rather than broken, to keep the standard call as the default and add an "Ultra Thinking" button that moves
the call to the extended model for harder questions. Controlled probes on this project's key (synthetic data, the
app's exact setup) found:

- The extended model loses a share of its own tool calls inside the provider: it says a filler, stays IN_PROGRESS,
  never sends the `toolCall`, and apologises for a "system error". LOW passed 42 of 49 single-tool runs (86%, 95%
  interval 73–93%) against 26 of 26 for `gemini-3.8-live`, with a minimal raw setup as with ours; in a later batch the
  first call was lost in 13 of 20 runs. Only ~62 text tokens reach the model between the filler and the apology, no
  error frame, a clean close. The failure is reproduced outside our app; its internal cause is unknown, and nothing proves it is free-tier specific.
- LOW decides on a tool about 4.6 s later than the standard model (first tool call p50 5.9 s vs 1.3 s) and processes
  about 6× the tokens per turn (~2.7k hidden text tokens per internal step).
- MEDIUM was not better than LOW on the same tasks (10 of 14 vs 12 of 14 with the guard) and thinks ~1.8× the tokens.
- Context sent with `turnComplete:false` while the extended model works is ignored; history sent through
  `historyConfig.initialHistoryInClientContent` is accepted by both models.

## Decision
1. One call, one brain, two modes. The standard mode is the plan's Live model; Ultra Thinking is the coach's
   instructions plus an Ultra section on `voice_coach_model` at `voice_coach_thinking_level`, LOW by default. The
   money, consent, facts and memory are the same objects in both.
2. The user chooses the mode, on the call screen, where the admin enabled it for the plan and the user has the coach.
   A switch opens a fresh session on the other model with the call's last lines as history; the brain's state stays
   on the server. If the new model cannot connect the call returns to its mode and says so. No mode or model changes
   without the user seeing it.
3. The extended model's lost-call apology is held for at most 0.9 s after a filler with no tool call, dropped unheard
   when it claims a failure no tool had, and the model is asked to call the tool again (twice per request, then an
   honest "I cannot reach that now").
4. Every call holds a seat in its model's pool across servers, one live call per user, and an explicit quota refusal
   pauses new calls on that model; a quota refusal never moves to another key or project.
5. HIGH is not the target. MEDIUM stays selectable for comparison only.

Rejected: making the extended model the default (slower on every turn, provider-side losses, several times the
tokens); a silent fallback to the standard model when the extended one fails (the user would not know which answer
they got); hopping keys or projects on quota; nudging the model by timer while it is silent (duplicates work).

## Consequences
Ultra Thinking reaches users only after it passes the same bar as the call: at least 95% of tasks done over every
attempt in the repeated corpus, held-out included, with no unauthorised or doubled write, and latency and cost per
done task measured against the standard mode. Until then it runs for test accounts only. The guard's drops are
counted (`lost_tool_call` incidents, `lostToolCalls` in the metrics) so the provider defect stays visible; once Google
fixes it the guard stops holding anything and can be removed. Customer data on the free tier is a separate question
(Google's unpaid terms ask for no personal or confidential data): real users' calls need that settled first.

Amended by 0018: request ownership, durable write claims, final recovery and input-TPM reservations are now enforced; model segments measure actual per-mode usage.
