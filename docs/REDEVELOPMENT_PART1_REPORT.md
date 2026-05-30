# SmartSpend Redevelopment — Part 1 Report

**Date:** 2026-05-21  
**Branch:** `cursor/45aa70d1`  
**Workspace:** `c:\Users\hp\.cursor\worktrees\smartspend_V1_fixed\4jwb`

## Progress status (Parts 1–3)

| Part                   | Status                         | Notes                                                        |
| ---------------------- | ------------------------------ | ------------------------------------------------------------ |
| **Part 1 — Free AI**   | **Implemented (this session)** | Routing, prompts, rule/embedding priority, token foundations |
| **Part 2 — Pro**       | **Not started**                | Pro separation, image/camera, goals, premium reports         |
| **Part 3 — Dashboard** | **Not started**                | Analytics, tickets, per-user caps, limits panel              |

## What was already in the codebase (pre-session)

- Classification pipeline v2.1 (rule → embedding → AI)
- Compressed micro-prompts in `ai-classifier.ts`
- `ai-usage-policy.ts` (budgets, per-user token override keys, analytics events)
- Egyptian rule engine, merchant registry, embedding hybrid layer

## What was implemented this session (Part 1)

### 1. Plan-aware smart routing (`api/lib/ai-routing.ts`)

- **Free:** Prefer rule engine (confidence floor 88%) → embedding-only when confident → AI last
- **Pro/Ultra:** Lower rule floor, richer AI context, dispute resolution via embeddings
- Logs `routing.route` + `routing.reason` in classification traces

### 2. Token-optimized AI prompts (`api/lib/ai-classifier.ts`)

- Pruned category lists from embedding top candidates (not all 21 categories every time)
- Shorter Free system/user prompts; Pro keeps fuller clarification policy
- Free skips temporal/profile bloat unless `richContext`
- Compact rule hints (`amount:category/sub`) instead of full objects
- Prompt token estimation when API returns `tokensUsed: 0`
- Free max AI output capped via routing (384 tokens default path)

### 3. Pipeline integration (`api/lib/classification-pipeline.ts`)

- Single routing decision drives rule / embedding / AI / hybrid paths
- Free skips post-AI embedding remap and dispute-resolution loops (saves 1–N embedding calls per request)
- Plan passed into embedding classifier thresholds

### 4. Classification quality (Free, 0-token paths)

- Colloquial voice patterns: coffee, fast food, recharge, ride-hailing (`rule-engine.ts`)
- Attached Egyptian amounts: `بعشرين` → `20` (`text-normalizer.ts`)
- SUB_CATEGORY_MAP entries for قهوة/قهو

### 5. Tests added

- `api/lib/ai-routing.test.ts`
- Coffee voice phrase test in `classification-v21.test.ts`

## Architecture decisions

1. **Hybrid-first for Free, AI-last** — aligns with cost targets without hard user-facing caps
2. **Routing module** separate from pipeline — enables Part 2 Pro fork without duplicating pipeline
3. **Structured JSON schema unchanged** — keeps mobile contract stable
4. **Token policy layer unchanged** — `ai-usage-policy` already supports per-user overrides; routing adds per-plan output caps

## Key files changed

- `api/lib/ai-routing.ts` (new)
- `api/lib/ai-routing.test.ts` (new)
- `api/lib/ai-classifier.ts`
- `api/lib/classification-pipeline.ts`
- `api/lib/embedding-engine.ts`
- `api/lib/rule-engine.ts`
- `api/lib/text-normalizer.ts`
- `api/lib/classification-v21.test.ts`
- `api/ai-router.ts` (routing in logs)
- `docs/REDEVELOPMENT_PART1_REPORT.md` (this file)

## Token benchmarks (estimated)

| Scenario                            | Before (typical)              | After (target)                                            |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Simple coffee voice (~6 words)      | 0 (if rules miss) or 2000+ AI | **0** (rule engine)                                       |
| ~100-word classify (Free, needs AI) | ~1800–2500                    | **~800–1400** (pruned cats + short prompts + 384 out cap) |
| Embedding-only Free simple          | N/A                           | **~1 embed call** (~50–150 effective tokens) vs full LLM  |

_Live Gemini benchmarks require API key in `.env` — not run in CI here._

## Test results

- **Automated:** `npm install` + `npx vitest run` — **9 files, 38 tests passed** (vitest v4.1.5, ~7s)
- **npm audit:** 15 vulnerabilities reported (8 moderate, 7 high) — not addressed in this pass
- **Static:** No linter errors on edited TS files
- **Manual checklist (recommended):**
  - [ ] Voice: "أنا شربت قهوة بعشرين جنيه" → أكل وشرب / قهوة وكافيه, `parsedBy: rule_engine`, `tokensUsed: 0`
  - [ ] Complex multi-line Free text → embedding or AI with `routing.reason` in logs
  - [ ] Pro user with ambiguous text → AI + dispute resolution still active

## Problems found

1. High token use came from **always sending full category tree + long clarification policy + post-AI embedding loops**
2. Free tier triggered AI too often when rule confidence was 80–87% (below old `needsAI` threshold but still accurate)
3. `بعشرين` attached amounts failed normalization → rule engine `no_amounts_found` → unnecessary AI

## Suggested improvements (Part 2+)

- Split `aiClassify` into `aiClassifyFree` / `aiClassifyPro` modules
- Pro monthly reports: dedicated prompt templates + PDF export
- Image/OCR pipeline with token budget channel `image`
- Dashboard: wire `user_token_limit_{type}_{id}` UI (schema support exists in `ai-usage-policy`)

## Blockers / user input needed

1. **Run `npm install`** in worktree then confirm vitest passes
2. **Gemini API key** for live token measurement on staging
3. Confirm **Free daily limits** should stay soft (current design) vs dashboard-enforced hard stops

## Part 2 plan (next session)

1. `api/lib/ai-classifier-pro.ts` — rich context, higher token budget, no embedding short-circuit
2. Goals: Free marketing stub + Pro AI plans in `pro-router.ts`
3. Image upload route + OCR pre-pass
4. Monthly report prompt overhaul in `ai-router.ts` `generateMonthlyInsights`

## Part 3 plan

1. Admin dashboard sections (AI Free/Pro, tokens, tickets, limits)
2. Support ticket lifecycle + auto-delete read tickets
3. Business analytics aggregates from `userAnalytics`
