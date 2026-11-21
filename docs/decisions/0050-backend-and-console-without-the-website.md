# 0050: The backend and the admin console run without the website

Date: 2026-11-05
Status: accepted

## Context
The product ships as the phone apps (`mobile/`, Flutter) and a server. The website in `src/` (a PWA with Capacitor
shells) was a trial; the owner does not want it to cost the server or a developer's machine anything, but wants it
kept. In code it was wired into everything:
- `npm run build` built it first and the server served it to every path that was not the API;
- `npm run dev` was the website's Vite server, with the API mounted inside it;
- the new admin console (decision 0041) imported the website's stylesheet, its UI components, its tRPC client, nine
  of the old console's tabs and the whole old console; the website's stylesheet locks page scrolling for a native feel,
  so the console could not scroll.

## Decision
- **The server does not serve the website.** `SERVE_WEB_APP` (default `false`) gates `dist/public`, the index fallback
  and the sitemap; without it `/` answers `{ service, console }`, `robots.txt` refuses every crawler and any other
  path outside `/api/` and `/admin/` is a 404.
- **Builds:** `npm run build` builds the console and the server bundle only; `npm run build:web` builds the website.
  CI still builds and checks the website (`test:build:web`) so it does not rot; it is never deployed.
- **Development:** `npm run dev` is the console's Vite server with the API and the voice WebSocket mounted, on port
  3000 where the phone apps' debug builds look; `npm run dev:web` is the website's, used by Playwright.
- **The console is a site of its own:** its own stylesheet (no scroll lock), its own UI kit (`admin/src/kit`), its own
  tRPC client (`admin/src/lib/trpc.ts`, which imports only the router's types) and its own Vite cache. The old screens
  it hosted were rebuilt as console pages, judged on what an admin needs rather than copied (2026-11-05): the old
  console page is gone, the console's Vite config has no `@` alias into `src/`, and
  `tests/knowledge/architecture.test.ts` refuses any import of `src/` from `admin/` or `api/`.

## Consequences
- The production image holds no website and spends nothing on it; turning it back on is one variable and one build.
- Nothing outside the website imports `src/`, so parking it costs nothing; deleting it, or reviving it, is one decision with no console work attached.
