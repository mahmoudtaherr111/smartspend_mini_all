# 0006. Gemini models: a chain of served text models, and the plain Live model for calls

- Status: accepted, implemented in `api/lib/model-mapper.ts`, `api/lib/ai-gateway.ts` and
  `api/services/voice/text-model.ts`; the call's default in `api/services/entitlements/voice.ts`.
- Decided and recorded: 2026-09-24.

## Context
Ultra's default text model, the reports default and the retired-name map all named `gemini-3.1-pro`, which Google does
not serve: the API answers 404 for it. Every Ultra request through `executeAiGateway` without an admin route failed,
and so did the voice call's post-call summary until it stopped using the gateway.

The key reaches `gemini-3.8-flash`, `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` (among others). On the same
short prompt, 3.8 Flash took about 10 seconds, 3.5 Flash Lite under one and 3.1 Flash Lite about two. During demand
spikes Google answers 503 for a model; 3.8 Flash did so repeatedly that day. The owner asked for these three models in
place of `gemini-3.1-pro`.

Calls have two Live models. On the same real questions, `gemini-3.8-live-extended-thinking` cost about 2.7 times as
much, took 10 to 35 seconds a turn, repeated tool calls, and once told the user the system had failed without calling
any tool. `gemini-3.8-live` started speaking within 0.7 to 2.4 seconds and called its tools reliably.

## Decision
1. One chain of Gemini text models, strongest first: `GEMINI_TEXT_CHAIN` is `gemini-3.8-flash`,
   `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`. `gemini-3.1-pro`, the older Pro names and the `pro`/`ultra`
   shorthand map to `gemini-3.8-flash`, Ultra's default; free and Pro stay on `gemini-3.1-flash-lite`.
2. When Google answers 429, 500 or 503, or the direct caller gets no answer in time, the request moves along
   `geminiFallbackChain`: the lighter models first, because they answer fastest, then the stronger ones nearest first,
   so the lightest model has somewhere to go too. Any other failure is the request's own and is not retried elsewhere.
3. Calls default to `gemini-3.8-live`, with the `think` tool for the questions that need reasoning. The
   extended-thinking model stays an option an admin can pick per plan (`voice_v2_model_<plan>`).

## Consequences
- An Ultra request that meets an overloaded 3.8 Flash is answered by a lighter model: faster and cheaper, sometimes
  less thorough. `ai_gateway.model_overloaded` in the log shows how often.
- A request on the lightest model can end on 3.8 Flash during a spike: rare, and the price of an answer instead of an
  error.
- The chain lives in code. When Google retires one of these models, the chain and the retired-name map in
  `api/lib/ai-provider-registry.ts` change together; `api/lib/model-mapper.test.ts` pins both.
- The call's default is worth measuring again when the extended-thinking model's turn time or tool behaviour changes.
