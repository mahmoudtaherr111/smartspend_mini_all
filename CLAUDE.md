# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read **@AGENTS.md** first — it is the authoritative brief for this repo (stack, commands,
layout, invariants). Everything below is only what AGENTS.md does not already cover.

## Testing

- Single file: `npm run test -- <path>` · single case: `npm run test -- -t "<name>"`
  (neither is a package.json script).
- `vitest.config.ts` injects dummy `DATABASE_URL` / `GEMINI_API_KEY` / etc., so unit tests
  run with no real MySQL or Redis. Redis integration tests are opt-in via `npm run test:redis`.

## Doc trust order

`db/schema.ts` > `AGENTS.md` > `docs/`. The `docs/` specs have drifted on counts —
`docs/01-ARCHITECTURE.md` claims 48 tables / 44 relations; the code has **52 tables**
(`db/schema.ts`) and **48 relation exports** (`db/relations.ts`). Verify counts against the
schema before quoting any number.
