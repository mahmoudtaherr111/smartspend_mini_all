# 0037. The website's session is the HttpOnly cookie alone

- Status: accepted. Built in `sessionCookie` (`api/local-auth-utils.ts`), its use in `localAuth.register`,
  `localAuth.login`, `localAuth.verifyOtp` and `webauthn.verifyAuthentication`, and in `src/providers/trpc.ts`,
  `src/hooks/useAuth.ts` and `src/pages/Login.tsx`. Held by `tests/security/web-session-cookie.test.ts`.
- Decided and recorded: 2026-10-29, from security known issues of the accounts and web app pages, with the owner
  (no users yet; "the best engineering solution: a protected cookie, simpler and secure").

## Context
A phone account's sign-in returned the session token, and the website kept it in `localStorage` and sent it as a
Bearer header, next to the HttpOnly `smartspend_token` cookie the server already set and accepted. Any script that
ran on the page (an injected one included) could read the token and use it elsewhere for seven days. A passkey
sign-in set no cookie at all, so the website depended on the stored token for it. Tabs also passed tokens to each
other in `BroadcastChannel` messages.

## Decision
1. **The browser holds the session, scripts never do.** Every sign-in the website uses sets the same cookie:
   HttpOnly, `SameSite=Lax`, `Path=/`, as long as the session (seven days), and `Secure` in production or whenever the
   request came over https, also through a proxy that says so. Requests to the API carry it because they are
   same-origin; the origin check and CSRF middleware (`api/lib/http-origin-security.ts`) stop other sites.
2. **The website never touches a token.** It does not store, read or send one, and tabs tell each other only that a
   sign-in, sign-out or expiry happened. A token older builds stored is removed when the app starts.
3. **The answer still carries the token** for the mobile app, which keeps it in the Keychain or Keystore and sends it
   as a Bearer header (decision 0022). The server keeps accepting a Bearer header first, then the cookies.
4. **The web build and the API stay on one site.** A separately deployed API must be on the same registrable domain,
   or the browser does not send the cookie.

## Consequences
- An injected script can still act inside the page while it runs, but it can no longer carry a session away.
- The Capacitor shells, which serve the build from `https://localhost` and call the API on another site, cannot keep a
  session; the Flutter app replaces them, and they are retired when the owner says so.
- A sign-in in one tab reaches the others through the channel (`AUTH_LOGIN`), since no storage key changes.
