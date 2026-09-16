# How agents work in this repository

Several AI agents (Claude Code, Codex, Antigravity, OpenCode, Cursor) and people change SmartSpend at the
same time, each in its own branch or worktree. This guide describes what keeps them on the same code and
keeps the documentation true without anyone updating it by hand. It is written from `scripts/agent/`,
`scripts/knowledge/`, `.githooks/`, `.claude/settings.json`, `.codex/hooks.json` and `.github/workflows/`.

## The idea
- Facts about the code are generated from the code (`npm run atlas`) and never written by hand, so a change
  to the code changes the facts in the same commit.
- What the code is FOR is written by hand once per system, and every page is recorded as checked against the
  source it describes, so a change to that source asks the agent who made it to read the page again.
- Rules are checks in `scripts/knowledge/`, so breaking one fails a command instead of hiding in a document.
- Regeneration and checks run on their own at the moments work changes hands: when a session starts, when an
  agent ends a turn, when anyone commits, merges or pushes, and when main changes.
- Every commit names the tool that made it (an `Agent:` trailer), so `npm run changes` can report who
  changed what without anyone keeping a log.

## A task, step by step
1. Start: `npm run sync` merges `origin/main` into the branch.
2. Read `AGENTS.md`, the system explanation of what you are about to change (find it in
   `docs/atlas/systems/files.md`), and the `AGENTS.md` of each folder to be edited.
3. Work in small commits.
4. Finish: `npm run agent:finish` regenerates `docs/atlas` and `docs/architecture/generated`, then checks the
   architecture rules, the hand-written documents, the flows and the system explanations, and prints the tests
   for the changed files.
5. Commit the code together with the regenerated files, then `npm run ship`: it refuses uncommitted changes,
   merges `origin/main` again and pushes the branch to `main`. When `main` moved in the meantime, it merges
   and pushes again.

## What runs on its own
| When | Set up in | What happens |
| --- | --- | --- |
| A Claude Code or Codex session starts | `.claude/settings.json`, `.codex/hooks.json`, running `scripts/agent/session-start.mjs` | Fetches origin; tells the agent how far its branch is behind main and which commits it lacks; restates the protocol; installs the git hooks when they are missing |
| A Claude Code or Codex turn ends | the same files, running `scripts/agent/stop.mjs` | When code or documents changed since the last check, runs `agent:finish`; a broken rule sends the agent back once with the violations |
| Anyone commits | `.githooks/pre-commit` | Refuses `.env` files and known secret formats; when staged code changes the atlas and no code change is left unstaged, regenerates the atlas into the commit |
| Anyone commits | `.githooks/prepare-commit-msg` | Adds `Agent: <tool>` when the tool can be told from the environment, the branch name or the worktree folder |
| A merge, pull or rebase | `.githooks/post-merge`, `.githooks/post-rewrite`, the merge driver in `.gitattributes` | Generated files do not conflict; the atlas is regenerated for the merged code and committed when it changed |
| Anyone pushes | `.githooks/pre-push` | Runs `agent:finish --check`; the push is refused while a rule is broken or the atlas is stale |
| A push reaches main | `.github/workflows/knowledge-autofix.yml` | Regenerates the atlas and commits it to main when it is stale; writes an Arabic summary of the system changes into the run |
| Any push or pull request | `.github/workflows/ci.yml`, knowledge job | Atlas freshness (outside main), `tests/knowledge`, LikeC4 validation |

`npm install` and `npm ci` install the git hooks through the `prepare` script, and `npm run hooks:install`
does it by hand. The hooks live in the common git directory, so one install covers every worktree. The
logic sits in `scripts/agent/git-hook.mjs`; the files in `.githooks/` only call it, so a worktree on an old
branch still gets the secret guard.

## Tool by tool
| Tool | Reads the rules from | Automation it gets |
| --- | --- | --- |
| Claude Code | `CLAUDE.md`, which imports `AGENTS.md`; a folder's `CLAUDE.md` loads when Claude reads files there | session and stop hooks, git hooks |
| Codex | the `AGENTS.md` files from the repository root down to its working folder, so it reads a folder's file only when it opens it | session and stop hooks once the project's `.codex` folder is trusted in Codex, git hooks |
| Antigravity | `.agents/rules/smartspend.md` (always on), which points at `AGENTS.md` | git hooks |
| OpenCode | `.opencode/opencode.json`, which loads `AGENTS.md` | git hooks |
| Other tools and people | `AGENTS.md` | git hooks, CI |

## Explanations that cannot go stale quietly
Generated facts say what exists. `docs/systems/` says what it is for, how it behaves, and what is wrong with
it today — which no generator can know. Both are kept honest the same way: by the code itself.

- Every system in `docs/architecture/systems.json` owns a set of source units: whole files, or single
  procedures, routes and jobs of a file that several systems share. `docs/atlas/systems/files.md` is the map
  from a file to its systems.
- `docs/systems/verified.json` records, per unit, the fingerprint of the source as it was when the explanation
  was last checked, plus the day each page was recorded and the commit HEAD was on; the generated index
  `docs/atlas/systems/README.md` shows that day per system. `npm run docs:verify -- <id>` writes that record after
  you have read the page against the code; `-- <id> --ar` records the Arabic page against the English one.
- `npm run agent:finish` compares the fingerprints with the working tree. A unit your branch changed makes its
  explanation **stale**: it is reported, and `.githooks/pre-push` refuses the push until you re-check it. A
  unit someone else changed is reported as a notice, so a stale page never blocks work that did not cause it.
- `scripts/knowledge/systems-docs.ts` also refuses a page that names a file or a symbol that no longer exists,
  that quotes a count the atlas owns, or that has an English page without its Arabic twin;
  `tests/knowledge/systems.test.ts` and `tests/knowledge/systems-ledger.test.ts` run those rules in CI.
- `docs/systems/verified.json` merges entry by entry through `scripts/agent/verified-ledger.mjs` (registered in
  `.gitattributes`), so two branches that re-check different systems do not conflict. Never edit it by hand.

The rule of thumb when a check names your system: read the page, fix what no longer matches the code —
including the known issues, which are the part that rots fastest — then record it. Do not record a page you
have not read against the code.

## Seeing who else is working
Agents in parallel used to be invisible to each other: two sessions could spend an hour in the same file and
meet only in a merge. Nobody announces anything — `npm run who` derives it from git:

- every worktree on the machine, its branch, how far behind main it is, and the files it has changed but not
  committed;
- every branch pushed to origin in the last week that is ahead of main, with the files it changes;
- each file mapped to its systems through `docs/atlas/systems/files.md`, and the files that overlap with what
  this worktree has changed.

`scripts/agent/session-start.mjs` prints the first few lines of that, overlaps first, so an agent knows before
it starts. It also asks GitHub whether main's last completed run of each workflow passed
(`scripts/agent/main-health.mjs`), so a red main is a fact the agent knows rather than a surprise at push time.
Both are best-effort: no token, short timeouts, and silence when the answer does not arrive.

## The queue, and who works it
An explanation cannot be assigned or closed, so the serious part of what the pages know is mirrored into
GitHub issues:

- Every known issue starts with its severity (`Security`, `Bug`, `Gap`, `Debt`; in Arabic `أمن`, `عطل`,
  `ناقص`, `دين تقني`), which `docs/atlas/systems/state.md` sorts by.
- `npm run issues:sync` opens one issue per security item — `--severity security,bug` or `all` widens it —
  labelled `agent-ready`, `system:<id>` and `severity:<x>`. It is idempotent: an issue carries a hidden
  fingerprint of the item's text, so a second run changes nothing, and an item that leaves its page (fixed,
  and the page corrected in the same change) closes its issue with a comment.
- `.github/workflows/backlog-sync.yml` runs it on main with the repository's own token; nothing is published
  and no secret is added.
- Any agent can take one: `@codex` on the issue works today with no setup, and `@claude` works as soon as
  `ANTHROPIC_API_KEY` exists in the repository secrets (`.github/workflows/agent.yml`, which also re-checks
  the oldest explanation every Monday and opens a pull request with the corrections). Until that secret
  exists, both jobs are skipped by their own preflight.

Two more checks report without blocking: `npm run knip` names files, exports and dependencies nothing
reaches — the class of problem a program can find on its own, and the one the pages were listing by hand —
and `lychee` walks the links that point outside the repository once a week.

## Seeing what changed
`npm run changes` lists the commits of the last seven days with the tool that made each one, and what changed
in the shape of the system: tables, procedures, HTTP routes, jobs, pages, modules and outside systems that
appeared or disappeared, and reads, writes, calls and uses that started or stopped. `--since "2 days ago"`,
`--from <rev> --to <rev>` and `--lang ar` change the range and the language. The report is built from git and
from the generated model, so it cannot drift from what happened.

## When something does not run
- The hooks do nothing: run `npm run hooks:install`, and make sure `git config core.hooksPath` prints nothing.
- The atlas did not go into a commit: some changed code was not staged. Stage it, or run `npm run atlas`.
- A person has to push while a rule is broken: set `SMARTSPEND_SKIP_PREPUSH=1` for that one push, then fix
  the rule.
- The pre-push hook fails open: where `tsx` cannot run it returns success silently, and any other failure
  prints that it could not run and lets the push through. Never treat a successful push as proof that the
  rules passed; run `npm run agent:finish` yourself.
- `SMARTSPEND_SKIP_ATLAS=1` turns off regeneration in the git hooks for one command.
- Codex runs no hooks: trust the project in Codex so it loads `.codex/hooks.json`; its hook commands assume the
  session starts at the repository root.
