# Web and mobile app shell

Everything around the screens: how the app boots, which route a person may open, the typed client that talks
to the API, the per-account offline cache, the navigation chrome, the PWA and Capacitor behaviour, and the
public pages (landing, privacy, terms and the not-found page).

- Facts generated from the code, with diagrams: [docs/atlas/systems/web-app.md](../atlas/systems/web-app.md)
- The same story for readers who do not read code: [docs/ar/systems/web-app.md](../ar/systems/web-app.md)
- Folder rules while editing: `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Entry | `src/main.tsx` | Mounts React, registers the service worker, consumes a launch event before the first render, and marks a standalone PWA |
| Shell | `src/App.tsx` | The providers, the route table and its guards, the layout, the error boundary, the per-account query cache, and, for signed-in users, the host of the live [voice call](voice-calls.md) (`src/components/voice/VoiceCallHost.tsx`), so a call keeps going, shrunk to a bar, on every page |
| API client | `src/providers/trpc.ts` | The typed tRPC client, the Bearer header, cookies, form-draft preservation and what happens on a 401 |
| Identity | `src/hooks/useAuth.ts` | The device's identity snapshot, the verified session, the role and plan helpers, and logout |
| Offline cache | `src/lib/queryPersister.ts` | The answers kept in IndexedDB per account, and the identity snapshot |
| Navigation | `src/components/Sidebar.tsx`, `src/components/layout/MobileBottomNav.tsx`, `src/components/layout/PageTransition.tsx` | The desktop sidebar, the phone tab bar and the transition between screens |
| Shell widgets | `src/components/NotificationBell.tsx`, `src/components/layout/PlanUsageStrip.tsx`, `src/components/ads/AdBanner.tsx`, `src/components/OnboardingCard.tsx` | The bell, the plan and usage strip, the ad banner and the first-run card |
| PWA | `src/pwa/`, `src/components/pwa/` | Service worker updates, install prompts, the launch handler, Firebase messaging, the offline queue dialog and the network toast |
| Native | `src/hooks/useNativeThemeSync.ts`, `src/hooks/useHaptics.ts`, `src/lib/back-button-manager.ts`, `src/components/layout/mobile-nav-platform.ts` | The Capacitor side: splash screen, theme, haptics, the Android back button and platform-specific navigation |
| Lock | `src/providers/BiometricLockProvider.tsx`, `src/lib/biometricAuth.ts` | The app lock and the passkey prompt ([accounts](accounts.md)) |
| Robot check | `src/lib/turnstile-config.ts`, `src/components/auth/TurnstileWidget.tsx` | The Cloudflare Turnstile widget on the sign-up form, built in only when `VITE_TURNSTILE_SITE_KEY` is set ([accounts](accounts.md)) |
| Behaviour hooks | `src/hooks/useAppResume.ts`, `src/hooks/useScrollRestoration.ts`, `src/hooks/useVirtualKeyboard.ts`, `src/hooks/useSwipeNavigation.ts` | Returning to the app, scroll position, the on-screen keyboard and swipe gestures |
| Utilities | `src/lib/transactionDisplay.ts`, `src/lib/financial-taxonomy.ts`, `src/lib/utils.ts` | How a transaction is presented; the category pickers, icons and colours, read from the server's taxonomy in `contracts/categories.ts` rather than a copy; the class-name helper |
| Public pages | `src/pages/Landing.tsx`, `src/pages/More.tsx`, `src/pages/Privacy.tsx`, `src/pages/Terms.tsx`, `src/pages/NotFound.tsx` | The landing page, the settings menu, the two legal pages and the 404 |

## Routes and who may open them
| Route | Guard | Screen |
| --- | --- | --- |
| `/` | signed in → `/dashboard` | Landing |
| `/login`, `/auth/callback` | signed out only (the callback is open) | Sign in ([accounts](accounts.md)) |
| `/privacy`, `/terms` | open | The legal pages |
| `/dashboard` | signed in | Home: recording, statistics and the calendar ([money](money.md)) |
| `/ai` | signed in | The AI Center ([AI Center](ai-center.md)) |
| `/bank-sync` | signed in | Bank and wallet messages ([bank messages](bank-messages.md)) |
| `/pro` | signed in | Plans and checkout ([billing](billing.md)) |
| `/support` | signed in | Support tickets ([admin](admin.md)) |
| `/more`, `/settings/*` | signed in | The settings menu and its sections; `/settings` redirects to `/more` |
| `/ultra` | signed in | The Ultra lounge |
| `/admin` | admin only, after the session is verified | The console ([admin](admin.md)) |
| anything else | open | Not found |

`ProtectedRoute`, `AdminRoute` and `PublicOnlyRoute` all wait for the verified session before taking access
away: the identity snapshot replayed from the device carries a name, avatar and plan, never a role.

## Booting fast, and coming back
- The device keeps an identity snapshot and a per-account query cache in IndexedDB, so a returning user sees
  their own shell on the first frame while `auth.me` is still in flight. The cache is written only after the
  session is verified, is scoped by account, is dropped when the account changes, and expires after twelve
  hours.
- Returning to the app refetches only after a real absence — ninety seconds — and only the queries on screen;
  React Query's refetch-on-focus is off, because a glance at a notification used to refetch everything at once.
- A failed lazy chunk (a deploy while the app was open) reloads the page once, guarded by a flag in
  `sessionStorage`.
- The service worker takes over on update and then reloads, so the user does not stay on the old shell.

## Talking to the API
- One `httpBatchLink` to `/api/trpc`, or to `VITE_API_URL` when the API is deployed separately, always with
  cookies. A token in `localStorage` is also sent as a Bearer header.
- A 401 — as a status or inside a batched answer — preserves every registered form draft in `sessionStorage`,
  tells the other tabs through a `BroadcastChannel`, and shows one Arabic message instead of dropping the
  user's typing.
- Sign-in, sign-out and session expiry are broadcast between tabs, so a second tab does not keep acting as the
  previous user.

## Phone and PWA
- Installed as a PWA or wrapped by Capacitor, the same build gets: a splash screen dismissed when React
  mounts, theme colour and status bar synced to the theme, the Android back button routed through one manager,
  haptics, a tab bar that respects the safe area and the on-screen keyboard, pull to refresh outside the chat,
  and scroll positions restored per screen.
- Items recorded while offline wait in `localStorage` and a dialog offers to send them when the connection
  returns ([recording spending](expense-capture.md)).
- Push permission and Firebase messaging are set up here and used by [notifications](notifications.md).

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| A route or its guard | `src/App.tsx` (and `BOTTOM_NAV_ROUTES` when it should show the tab bar) | `tests/e2e/`, `tests/knowledge/architecture.test.ts` |
| The tab bar or the sidebar | `src/components/layout/MobileBottomNav.tsx`, `src/components/Sidebar.tsx` | `src/components/layout/MobileBottomNav.test.ts` |
| What happens on a 401 | `src/providers/trpc.ts` | |
| What is cached offline | `src/lib/queryPersister.ts` | `tests/query-persister.test.ts` |
| Service worker and install | `src/pwa/register-sw.ts`, `src/components/pwa/PwaInstallPrompt.tsx` | `tests/pwa-instant-resume.test.ts` |
| The Android back button | `src/lib/back-button-manager.ts` | `tests/back-button-manager-adversarial.test.ts` |

## Rules for changes here
1. Reach the server only through `trpc.<router>.<procedure>`; from `api/` import types only (`src/AGENTS.md`,
   rule 1).
2. The interface is Arabic and right-to-left: use logical utilities (`ms-`, `me-`, `ps-`, `pe-`), not left and
   right ones.
3. After a mutation, invalidate the queries it changes through `trpc.useUtils()`.
4. A guard that takes access away waits for `isVerified`; the snapshot may only add, never remove.
5. Limits and plan features shown to users come from `contracts/constants.ts` and `contracts/plans.ts`.

## Tests
`tests/e2e/` (Playwright), `tests/query-persister.test.ts`, `tests/pwa-instant-resume.test.ts`,
`tests/back-button-manager-adversarial.test.ts`, `tests/native-mobile-ux-adversarial.test.ts`,
`tests/capacitor-manifest-sync.test.ts`, `tests/static-compression.test.ts`, `tests/fonts-self-hosted.test.ts`
and the component tests beside their files.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** `/ultra` is wrapped in `ProtectedRoute`, so any signed-in user opens the Ultra lounge — while the page
   itself tells the reader it is protected by `UltraFeatureRoute`. Both gates in
   `src/components/routing/PlanGates.tsx` are unused, so the plan is checked on the server only.
2. **Security.** The session token is kept in `localStorage` and sent as a Bearer header, next to the HttpOnly cookie the
   API also accepts ([accounts](accounts.md)).
3. **Debt.** `src/components/ProductTour.tsx` is never mounted, and `src/lib/backButtonManager.ts` only re-exports
   `src/lib/back-button-manager.ts` for an importer that no longer exists.
4. **Debt.** The list of routes that show the tab bar lives in `BOTTOM_NAV_ROUTES` next to the route table, so a new
   screen has to be added in both places or it loses its navigation.
5. **Bug.** Logging out deletes the offline queues (`smartspend_offline_texts` and `smartspend_offline_manual`) from
   `localStorage`, so anything recorded offline and not yet sent is lost with the session.
6. **Gap.** The only usage event the app sends is `session_duration`, and only when a visit lasted more than ten
   seconds, so the founder metrics see almost nothing of what people do ([admin](admin.md)).
7. **Bug.** When Firebase's web configuration is missing the app silently falls back to Web Push with a key written in
   the code ([notifications](notifications.md)).

## Related systems
- [Accounts, sign-in and security](accounts.md): the session behind every guard, and the app lock.
- [Money: expenses, wallets, budgets, goals and businesses](money.md) and [Recording spending](expense-capture.md):
  the screens the shell hosts, and the offline queue.
- [AI Center](ai-center.md) and [Live voice assistant](voice-calls.md): the workspace route and the call UI.
- [Notifications and WhatsApp](notifications.md): push permission, the bell and Firebase.
- [Plans and payments](billing.md): the plan strip and the upgrade screens.
- [Admin console, support and growth tools](admin.md): the admin route, the ad banner and the usage events.
- [Server platform and data](platform.md): the API the client talks to, and the origins it is allowed from.
