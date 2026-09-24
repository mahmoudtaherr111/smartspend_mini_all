# 0007. What each plan includes is an admin setting, not code

- Status: accepted, implemented in `contracts/plan-features.ts`, `api/middleware.ts` (the per-feature builders),
  `api/lib/plan-catalog.ts`, `api/lib/system-settings-registry.ts` and
  `src/components/admin/settings/AdminPlansTab.tsx`.
- Decided and recorded: 2026-09-24.

## Context
The owner has not settled the plans yet and wants to set every plan's limits from the admin console rather than
have them decided in code. Several were in code: receipts, business mode, the printable Pro report and the goal
analysis were hard-wired to Pro and Ultra (`proProcedure`); the free plan's three active goals, the per-minute AI
burst guard and the WhatsApp report's "Pro only" were constants. The console edited Free and Pro only, so no Ultra
limit could be changed; its chat switches and limits were rendered for all three plans but dropped on save, because
the keys were missing from the settings registry. The plans screen listed fixed text ("استخدام AI غير محدود", Excel
export, switching models) that matched neither the limits nor the app.

## Decision
1. Every per-plan feature is a switch `feature_<feature>_<plan>` and every per-plan number without a setting is
   `<name>_<plan>`, declared once with its default in `contracts/plan-features.ts`. The defaults are the values the
   code used to hard-code, so the change alters nothing until an admin edits a value.
2. The server gates each feature with a named builder from `api/middleware.ts` that reads the switch for the caller's
   plan; unreadable settings fall back to the defaults, never to "allowed", and admins always pass.
3. The console has one tab per plan — Free, Pro and Ultra — with every limit and switch of that plan.
4. The plans screen renders `pro.planCatalog`, built from the same settings the server enforces, so it cannot promise
   more than the limits allow.
5. Prices stay in `contracts/plans.ts`: the Paymob webhook accepts only the exact configured amount, and moving that
   check to an editable setting is a separate decision.

## Consequences
- A new plan feature is a row in `contracts/plan-features.ts`, a builder in `api/middleware.ts` and, when it should
  show on the plans screen, a row in `api/lib/plan-catalog.ts`; `api/lib/plan-features.test.ts` pins the defaults and
  that every key is saveable.
- The hard per-request token ceilings in `api/lib/ai-usage-policy.ts` remain a safety net in code; an admin value
  above them is clipped.
- Model routing for Ultra still follows Pro's routing ranges (a separate known issue in the AI platform page).
