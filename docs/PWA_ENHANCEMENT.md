# PWA Enhancement Report (in-place evolution)

**Date:** 2026-05-21  
**Stack:** Existing `public/manifest.json` + `public/sw.js` + `index.html` registration — **no second PWA layer** (no vite-plugin-pwa duplicate).

## What existed BEFORE

| File | Role | Issues |
|------|------|--------|
| `public/manifest.json` | Web app manifest | Single combined icon size; no `scope`/`id`; no maskable |
| `public/sw.js` | Service worker v1 | **Cache-first for all requests** — risk of stale API/HTML |
| `index.html` | Loader + inline `navigator.serviceWorker.register('/sw.js')` | No iOS install meta; `100vh` only; duplicate register path |
| — | Install UX | No `beforeinstallprompt` banner |
| — | Offline | Navigate fallback to `/` only, no dedicated offline page |
| — | Updates | No user prompt on new SW version |

**Not present:** `vite-plugin-pwa`, `registerSW` virtual module, generated workbox bundle.

## What changed (AFTER)

| File | Change |
|------|--------|
| `public/sw.js` | **v3** strategies: API/trpc **network-only**; navigation **network-first**; hashed `/assets/*` + css/js **stale-while-revalidate**; images bounded cache; shell precache only 5 URLs |
| `public/manifest.json` | `scope`, `id`, maskable icon entry, `display_override`, categories |
| `public/offline.html` | **New** — RTL offline fallback (used by SW, not a second app) |
| `index.html` | iOS PWA meta, `100dvh` splash, removed inline SW script (single register in app) |
| `src/pwa/register-sw.ts` | **New** — register `/sw.js`, install prompt capture, gentle update toast |
| `src/components/pwa/PwaEnhancements.tsx` | **New** — Android install banner + iOS Add-to-Home hint |
| `src/main.tsx` | SW register + fade-out branded loader |
| `src/App.tsx` | `PwaEnhancements`, `min-h-dvh`, `overflow-x-hidden` |
| `src/index.css` | Safe-area, 16px inputs on mobile, standalone overscroll |
| `vite.config.ts` | `manualChunks` for vendor + recharts (smaller initial parse) |

## Cache strategy summary

```
GET /api/* , /trpc     → network only (never cached)
navigate (HTML)        → network-first → index.html → offline.html
images                 → SWR, max 48 entries
js/css/fonts/assets/*  → SWR, max 64 entries
shell (install)        → /, index.html, manifest, icon, offline.html only
```

## Performance / Lighthouse targets (manual)

| Metric | Target | How to verify |
|--------|--------|----------------|
| PWA installable | Pass | Chrome DevTools → Application → Manifest |
| Works offline | Shell + offline page | DevTools → Network → Offline → reload |
| No stale API | Always fresh | Use app online; SW must not cache `/api` |
| FCP | Improve | Smaller vendor chunk; inline loader fades at hydrate |
| CLS | Low | Fixed bottom nav + safe-area padding |
| TBT | Improve | Lazy routes already in `App.tsx` |

Suggested commands:

```bash
npm run build
npx vite preview
# Chrome Lighthouse → Mobile → PWA + Performance
npx vitest run
```

## Install testing

### Android (Chrome)

1. Serve over **HTTPS** (or localhost).
2. Open `/dashboard`, use app once.
3. Banner "ثبّت SmartSpend" or menu → Install app.
4. Launch from app drawer — `display-mode: standalone`, bottom nav clears safe area.

### iOS (Safari)

1. Open site in Safari (not in-app browser).
2. Share → **Add to Home Screen**.
3. Hint banner explains steps if install event unavailable.

### Update flow

1. Deploy new build (bump `smartspend-shell-v3` → v4 in `sw.js` when changing precache).
2. Returning users get toast **"تحديث جديد متاح"** → tap **تحديث الآن** (no forced `skipWaiting` on install).

## Known blockers

1. **Single `icon.png`** — ideal: separate 192 and 512 assets for sharper splash (manifest still references one file).
2. **Precache vs Vite hashes** — hashed bundles rely on runtime SWR, not install precache (by design to keep precache small).
3. **iOS** — no `beforeinstallprompt`; manual Add-to-Home only.
4. **HTTPS required** for SW outside localhost.

## Mobile UX (same session)

- Bottom nav + `pb-nav-safe` on main content
- Install banner above nav
- Feedback FAB offset above nav
- Input `font-size: 16px` on phones (prevents iOS zoom)

## Future (optional, still one stack)

- Replace hand-written `sw.js` with **vite-plugin-pwa** build injection while keeping same manifest URL — only when team wants auto-precache of hashed `dist/assets/*`.
