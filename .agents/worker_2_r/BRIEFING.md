# BRIEFING — 2026-08-23T20:12:00Z

## Mission
Implement Milestone 2 tasks: advisory lock type fix, batchCreate N+1 optimization & aggregate contact updates, TRPCError standardization across routers, Paymob currency defense-in-depth, UI Dialog / Command / SEOMeta accessibility & title resilience, and .gitignore hygiene.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: E:/smartspend_V1_fixed/.agents/worker_2_r
- Original parent: 60c11ee2-eb2f-44a7-b9b8-7dfcf3cdeefa
- Milestone: Milestone 2

## 🔒 Key Constraints
- EXCLUSIVELY own and modify:
  - api/services/scheduler-lock.ts
  - api/expense-router.ts
  - api/support-router.ts
  - api/profile-router.ts
  - api/admin-whatsapp-router.ts
  - api/boot.ts
  - src/components/ui/command.tsx
  - src/components/ui/dialog.tsx
  - src/components/seo/SEOMeta.tsx
  - .gitignore
- Genuine implementation, no hardcoding or mock workarounds.

## Current Parent
- Conversation ID: 60c11ee2-eb2f-44a7-b9b8-7dfcf3cdeefa
- Updated: not yet

## Task Summary
- **What to build**:
  1. Fix TS2344 in `api/services/scheduler-lock.ts`
  2. Optimize `batchCreate` and `resolveExpenseReferences` in `api/expense-router.ts` with batched `inArray` queries + batch aggregated updates for `userContacts`
  3. Replace raw `throw new Error` with `TRPCError` in `api/expense-router.ts`, `api/support-router.ts`, `api/profile-router.ts`, `api/admin-whatsapp-router.ts`
  4. Add defense-in-depth currency guard (`EGP`) in Paymob webhook handler in `api/boot.ts`
  5. Fix Dialog accessibility in `command.tsx` & `dialog.tsx`, and title sync + retry config in `SEOMeta.tsx`
  6. Update `.gitignore` with `dev-dist/`, `*.png`, `.audit-*`
- **Success criteria**: `npm run check` passes with 0 errors, all targeted and relevant tests pass, clean handoff report.
- **Interface contracts**: `PROJECT.md`, `AGENTS.md`
- **Code layout**: `PROJECT.md`

## Key Decisions Made
- Will batch `contactId` and `classificationLogId` checks via single `inArray` queries and build Maps/Sets for O(1) in-memory lookup.
- Will aggregate contact transaction counts into a map and execute minimal grouped updates.

## Artifact Index
- `.agents/worker_2_r/DISPATCH.md` — Assignment instructions
- `.agents/worker_2_r/BRIEFING.md` — Agent briefing & memory
- `.agents/worker_2_r/progress.md` — Liveness & progress tracker
- `.agents/worker_2_r/handoff.md` — Final handoff report

## Change Tracker
- **Files modified**: None yet
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: Not yet run
- **Lint status**: Clean
- **Tests added/modified**: Pending

## Loaded Skills
- None
