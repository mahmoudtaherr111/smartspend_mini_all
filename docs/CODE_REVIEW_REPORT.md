# Code Review & Logic Fixes — 2026-05-21

## Automated checks

| Check            | Result                    |
| ---------------- | ------------------------- |
| `npm run build`  | Pass                      |
| `npx vitest run` | **40/40** pass (10 files) |

## Logic fixes applied this session

### 1. Admin `proUsers` undercounted Ultra subscribers

**File:** `api/admin-router.ts`  
**Issue:** Dashboard counted only `plan = "pro"`, missing `ultra`.  
**Fix:** Count both `pro` and `ultra` for OAuth and local users.

### 2. Dead token limit branch in `parseExpense`

**File:** `api/ai-router.ts`  
**Issue:** `if (false && usedTokens >= tokenLimit)` never ran — monthly cap relied only on partial paths.  
**Fix:** Removed dead code; enforcement is solely via `assertAiBudget()` (hard cap + per-user override + burst guard).

### 3. `maxPerRequest` ignored unified policy caps

**File:** `api/ai-router.ts`  
**Issue:** Clamping used `getAiClient().maxPerRequest` instead of `budget.perRequestMax` from `ai-usage-policy` (admin + hard ceiling).  
**Fix:** `clampOutputTokens(budget.perRequestMax, ...)`.

### 4. Pro/Ultra wasted embedding API calls

**File:** `api/lib/classification-pipeline.ts`  
**Issue:** Every non-trivial Pro request called `runEmbeddingClassifier` before routing, but `decideClassificationRoute` sets `useEmbedding: false` for paid AI-primary.  
**Fix:** Skip embed when `plan === "pro" | "ultra"` and rules not already strong; log `skipped_pro_ai_primary`. Keyword priors still feed AI.

### 5. Redundant condition in `shouldForceAi`

**File:** `api/lib/ai-routing.ts`  
**Fix:** Simplified Free branch after strong-enough check.

### 6. Tests

**File:** `api/lib/ai-routing.test.ts` — added Pro trivial 95% rule acceptance test.

---

## Verified as correct (no change)

- **Paymob webhook** — HMAC verification + `grantProSubscription` from extras (`api/boot.ts`).
- **Production simulate block** — `pro-router.ts` `upgrade` forbidden outside dev/`BILLING_SIMULATE`.
- **Per-user token cap** — `setUserTokenLimit` + `getAiBudget` override key (`api/admin-router.ts`, `ai-usage-policy.ts`).
- **Founder metrics** — `getFounderMetrics` wired in `Admin.tsx`.
- **Free lazy embed** — skip when `ruleAlreadyStrong` (88% Free / 95% Pro).

---

## Remaining gaps (not logic bugs — product backlog)

1. **Phase 2–4 classification plan** — golden-set, expanded rules, muscle promote (see `CLASSIFICATION_UPGRADE_MASTER_PLAN.md`).
2. **Dashboard Part 3** — full analytics redesign, ticket read/unread, auto-delete.
3. **Admin UI** for `setUserTokenLimit` — API exists; add field on user row in Admin.
4. **Manual smoke** — fill `PRODUCTION_LAUNCH_CHECKLIST.md` after deploy.
5. **npm audit** — 15 advisories noted in Part1 report (run `npm audit fix` when safe).

---

## Recommended manual smoke (15 min)

1. Free: voice/text "أنا شربت قهوة بعشرين جنيه" → أكل وشرب / قهوة، tokens ≈ 0.
2. Pro: same phrase at 96% rule → rule engine; ambiguous phrase → AI, no extra embed in logs (`skipped_pro_ai_primary`).
3. Hit monthly cap (test user with `setUserTokenLimit` = low) → upgrade message, no bypass.
4. Pro page checkout without Paymob keys → "الدفع غير متاح" in production.
5. PWA: install on Android Chrome → opens standalone.
