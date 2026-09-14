# 0004. Scope of the commercial (B2B) module

- Status: accepted, not implemented. On 2026-09-14 the schema has no workspace or commercial tables and `expenses` still has
  `business_id`.
- Decided: 2026-09-08, by the project owner, when approving a rebuild of the business module. The blueprint is kept outside
  the repository.
- Recorded: 2026-09-14.

## Context
Business mode today is a tagging feature on the personal ledger: `user_businesses`, `business_categories`,
`api/business-router.ts`, and a nullable `business_id` on `expenses`. It has no membership, no roles, and no ledger of
parties, and `business_id` sits on the personal hot path and its covering index.

## Decision
1. A separate commercial ledger with its own tables. `expenses` stays personal and loses `business_id`.
2. Personal finance stays as it is. Workspaces exist for business tenants only; the tables scoped by `user_id` and
   `user_type` are not touched. "Personal" is a client-side choice in the workspace switcher, not a workspace row.
3. The first market is retail and micro-merchants: cash drawer and shift close, supplier and customer debt, several
   accounts, owner drawings. Not freelancers, not workshops.
4. No tax layer: no VAT or withholding calculations, no e-invoicing, no tax reports. Nullable tax columns may be reserved
   but nothing reads them.

## Consequences
- Until the commercial module ships, the existing business mode stays in place and keeps its current behaviour.
- Removing `business_id` from `expenses` is a migration of the core ledger table and needs its own plan.
- Proposals for freelancer features, tax handling, or merging business data into the personal ledger contradict this
  record; they need a new record that supersedes it.
