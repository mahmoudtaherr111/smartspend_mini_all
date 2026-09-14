# 0001. Two user tables; a user is the pair of id and type

- Status: in effect
- Introduced: commit bb6c21b, 2026-05-10 (first appearance of `local_users` in `db/schema.ts`)
- Recorded: 2026-09-14, from the code. The original reasoning was not written down.

## Context
People sign in two ways: with a Google account, or with a phone number, a password and a WhatsApp code.

## Decision
Each way has its own table: `users` for Google accounts and `local_users` for phone accounts, each with its own
auto-increment id. A person is identified by the pair (`user_id`, `user_type`), where the type is `oauth` or `local`,
and every user-owned row stores both columns.

## Consequences
- The same numeric id exists in both tables. A query that filters on `user_id` alone can read or change another person's
  rows, so every query filters on both columns (golden rule 1 in `AGENTS.md`).
- `api/context.ts` builds `ctx.user` with a `type`: it tries a local session token first (the Authorization header or the
  `smartspend_token` cookie) and the `google_session` cookie second.
- `db/relations.ts` declares each user-owned table twice, once towards `local_users` and once towards `users`.
- A column that points at a user from somewhere else needs its own type column (`referredByType` on both user tables,
  `referrerType` and `referredType` on `referrals`).
- Anything that works across all users covers both tables: admin statistics, rate-limit keys (`usr:<type>:<id>` in
  `api/middleware.ts`) and account deletion (`purgeUserData(tx, userId, userType)` in `api/services/user-purge-service.ts`).
