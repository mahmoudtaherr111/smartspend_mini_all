# How agents work in this repository

Several AI agents (Claude Code, Codex, Antigravity, OpenCode, Cursor) and people change SmartSpend at the
same time, each in its own branch or worktree. This guide describes what keeps them on the same code and
keeps the documentation true without anyone updating it by hand. It is written from `scripts/agent/`,
`scripts/knowledge/`, `.githooks/`, `.claude/settings.json`, `.codex/hooks.json` and `.github/workflows/`.

## The idea
- Facts about the code are generated from the code (`npm run atlas`) and never written by hand, so a change
  to the code changes the facts in the same commit.
- Rules are checks in `scripts/knowledge/`, so breaking one fails a command instead of hiding in a document.
- Regeneration and checks run on their own at the moments work changes hands: when a session starts, when an
  agent ends a turn, when anyone commits, merges or pushes, and when main changes.
- Every commit names the tool that made it (an `Agent:` trailer), so `npm run changes` can report who
  changed what without anyone keeping a log.

## A task, step by step
1. Start: `npm run sync` merges `origin/main` into the branch.
2. Read `AGENTS.md` and the `AGENTS.md` of each folder to be edited.
3. Work in small commits.
4. Finish: `npm run agent:finish` regenerates `docs/atlas` and `docs/architecture/generated`, then checks the
   architecture rules, the hand-written documents and the flows, and prints the tests for the changed files.
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
- `SMARTSPEND_SKIP_ATLAS=1` turns off regeneration in the git hooks for one command.
- Codex runs no hooks: trust the project in Codex so it loads `.codex/hooks.json`; its hook commands assume the
  session starts at the repository root.
