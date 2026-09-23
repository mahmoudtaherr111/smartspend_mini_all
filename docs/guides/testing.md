# Tests

Which suite covers what, how to run it, and where CI runs it. Written from `vitest.config.ts`, `package.json`
and `.github/workflows/ci.yml`.

## Suites
| Suite | Command | Needs | CI job |
| --- | --- | --- | --- |
| Unit and component tests | `npm run test` | nothing: `vitest.config.ts` injects dummy environment values | `unit-tests` |
| Database integration | `npm run test:db` | a MySQL database with the current schema in `DATABASE_URL` | `integration-tests` |
| Redis integration | `npm run test:redis` | a Redis server in `REDIS_URL` | `integration-tests` |
| Build output, and both server bundles start and answer /health | `npm run test:build` | `npm run build` and `npm run backend:build` first | `build` |
| Knowledge rules | `npx vitest run tests/knowledge` | nothing | `knowledge` |
| End to end | `npm run test:e2e` | Playwright, configured in `playwright.config.ts` | `e2e-tests` |

The classification benchmark has its own commands; see `api/lib/AGENTS.md`.

## Rules for tests
- Test the code the product runs: import the module, or render the component. A test that defines its own
  copy of what it claims to test, or matches regular expressions against source text, passes whatever the
  product does.
- Tests never change the repository: no `git add`, no `git commit`, no writes to tracked files.
- A test that needs MySQL, Redis or a build declares it with `describe.runIf(...)` or `it.runIf(...)` on
  `RUN_DB_INTEGRATION`, `RUN_REDIS_INTEGRATION` or `REQUIRE_BUILD`, and is listed in the matching script, so
  `npm run test` runs on any machine.
- DOM matchers such as `toBeInTheDocument` are registered for every test by `tests/setup/jest-dom.ts`.

## The database suite on your machine
`docker compose -f docker-compose.test.yml up -d` starts MySQL 8 on port 3307 with the database
`smartspend_test`. Point `DATABASE_URL` at it, create the schema, then run the suite:

```bash
export DATABASE_URL=mysql://test:test@127.0.0.1:3307/smartspend_test
npx drizzle-kit push --force
npm run test:db
```

CI creates the schema the same way, against the MySQL and Redis services of the `integration-tests` job.
