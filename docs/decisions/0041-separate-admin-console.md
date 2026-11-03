# 0041 — The admin console is a site of its own

Date: 2026-11-03. Status: accepted.

## Context
The admin console was a page of the web app (`src/pages/Admin.tsx`, about 2,600 lines, plus about 7,700 lines of tab
components). Running it meant deploying the whole web app, its service worker and its install. The owner may not deploy
the web app at all, and wants a console that a person who knows nothing about technology can run the product from:
connectors and keys, every AI call and its cost, why a sentence was classified, users, support, subscriptions, and
analytics per platform. The research behind this record lists what each service lets the admin see and change and
what was missing.

## Decision
- The console lives in `admin/`, a Vite app with its own entry and build (`dist/admin`). The API server serves it at
  `/admin`, whether or not the web app is built; `npm run admin:dev` runs it with the API on port 3100.
- It is same-origin with the API and uses the session cookie, as the web app does. Sign-in is Google (with
  `?next=/admin/`, honoured only for paths under `/admin/`) or a phone account with the admin or moderator role.
  A host such as `admin.<domain>` must be listed in `ALLOWED_ORIGINS` and in the Google console's redirect URIs.
- New pages ask a router made for them, `adminConsole` in `api/admin-console-router.ts`, shaped for one screen each,
  so the 2,600-line admin router does not grow.
- The previous console stays reachable inside the new one under «باقي الأدوات» until each area has moved, so nothing
  an admin can do today is lost during the rebuild. An area leaves it once its new page is live.
- The console is never indexed (`X-Robots-Tag: noindex`) and never cached (`no-store`, except hashed assets).

## Consequences
- The web app's `/admin` route and the old tab components are removed area by area as their replacements land.
- Usage analytics are computed on our own server from our own tables, not sent to an outside tool.
- Discount codes and referral codes leave the console until the stores can apply them.
