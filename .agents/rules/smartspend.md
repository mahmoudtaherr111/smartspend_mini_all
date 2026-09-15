---
trigger: always_on
---

# SmartSpend AI

This rule only points Antigravity at the project's instructions; it holds no facts of its own.

- Before any change, read `AGENTS.md` at the repository root, then the `AGENTS.md` of every folder you edit
  (`api/`, `api/lib/`, `src/`, `db/`).
- Facts about the code come from `docs/atlas/`, which is generated from the code. Never write counts or file
  lists from memory.
- Start a task with `npm run sync`. Before you report it done, run `npm run agent:finish`, fix what it reports,
  and commit the code together with the regenerated files.
