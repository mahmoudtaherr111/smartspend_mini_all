# 0014. The migrations build the schema, and CI proves it

- Status: accepted, implemented in `db/migrations/0027_reconcile_schema.sql`, `scripts/db-doctor.ts` and the
  `integration-tests` job of `.github/workflows/ci.yml`.
- Decided and recorded: 2026-09-29.

## Context
CI and the database tests create their schema with `drizzle-kit push`, straight from `db/schema.ts`, so nothing ever
ran the migrations. They had drifted: a new database built with `npm run db:migrate` stopped at
`0021_storage_lifecycle_overhaul.sql`, which indexes `expenses.business_id` that no migration adds, and past it would
still have lacked the business tables, five contact columns, `auto_renew`, the unique indexes on the Paymob
transaction id and on `users.email`, and the session columns the sign-in code writes (a hex `token_hash`, a nullable
`token`), so nobody could sign in. The 0026 snapshot records all of it as present, so `npm run db:generate` would
never emit it. A database made with `drizzle-kit push` has everything but no migration journal, and
`npm run db:migrate` there runs every migration from the first and fails on the first table that exists. Which of the
two a production database is could not be told from the repository.

## Decision
1. `0027_reconcile_schema.sql` brings any database to the schema. Each change checks `information_schema` first, so on
   a database that already matches it changes nothing and it can run again. A binary hash from 0021 becomes the same
   hash in hex, so sessions survive. 0021 adds `expenses.business_id` where it is missing, so the chain runs from an
   empty database.
2. `npm run db:doctor` reads a live database and compares it with `db/schema.ts` (tables, column types and NULL,
   index names, uniqueness and columns; not defaults) and with the journal, and says what to run. `--baseline`
   records every migration as applied on a database that matches the schema and has no journal; it refuses
   otherwise.
3. CI builds a second database from the migrations and runs `npm run db:doctor -- --strict`: a schema change without
   a migration that makes it fails the build.
4. Hand-written migrations are allowed only in that guarded style, and keep the snapshot equal to the schema.

## Consequences
- Before the first `npm run db:migrate` on an existing database, run `npm run db:doctor`; a database made with push
  needs `--baseline` once.
- 0027 fails where `pro_subscriptions.transaction_id` or `users.email` already holds duplicates; they have to be
  resolved by hand, since the unique index is what stops a Paymob payment from granting twice.
- The doctor does not compare defaults or column order; a difference there is not caught.
