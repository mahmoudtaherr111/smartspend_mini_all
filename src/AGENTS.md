# src/ — web app

Facts: `docs/atlas/frontend.md` (browser routes, guards, the procedures each page calls, and mutation hooks
that are never invoked). Diagram: `npm run arch`, view `web`.

## Layout
- `App.tsx`: routes. Pages are lazy-loaded from `pages/` and wrapped in the route guards `ProtectedRoute`,
  `AdminRoute` and `PublicOnlyRoute`.
- `providers/trpc.ts`: the typed tRPC client.
- `components/ui/`: shadcn and Radix primitives. Feature components live in `components/<area>/`, hooks in
  `hooks/`, helpers in `lib/`, service-worker and install logic in `pwa/`.
- The Android and iOS apps are Capacitor shells around this build (`android/` and `ios/` at the repository
  root).

## Rules
1. Reach the server only through `trpc.<router>.<procedure>`. From `api/`, import types only
   (`import type { AppRouter }`); never runtime code from `api/` or `db/`. (`tests/knowledge/architecture.test.ts`)
2. The interface is Arabic and right-to-left: use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`,
   `end-`) instead of left and right ones. (unenforced)
3. After a mutation, invalidate the queries it changes through `trpc.useUtils()`.
4. Do not add new reads of the session token from `localStorage`; the API also accepts the HttpOnly
   `smartspend_token` cookie. (unenforced)
5. Limits and plan features shown to users come from `contracts/constants.ts` and `contracts/plans.ts`.
6. Component tests use Vitest and Testing Library. The `toBeInTheDocument` matcher is not registered, so
   assert on the queries themselves.
