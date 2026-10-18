# Accounts, sign-in and security

How people get in and stay in: Google sign-in, phone numbers with passwords, passkeys, sessions and logout, the app
lock on the device, the sign-in of the Flutter app in `mobile/`, and the protections every request passes through (origins, headers, client IP, rate limits, login
protection, ownership checks, upload checks, bot protection). Also account changes and account deletion.

- Facts generated from the code, with diagrams: [docs/atlas/systems/accounts.md](../atlas/systems/accounts.md)
- The same story for readers who do not read code: [docs/ar/systems/accounts.md](../ar/systems/accounts.md)
- Folder rules while editing: `api/AGENTS.md`, `api/lib/AGENTS.md`, `src/AGENTS.md`

## Two kinds of account
Google users are rows of `users` and phone users rows of `local_users`. `ctx.user.type` is `oauth` or `local`, and
every user-owned row carries both the id and the type (golden rule 1). Nothing links the Google account and the phone
account of the same person.

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Login screen | `src/pages/Login.tsx#Login` | Phone login, phone sign-up with optional WhatsApp verification, Google and passkey sign-in |
| Settings | `src/pages/Settings.tsx#Settings`, `src/components/auth/PasskeySettings.tsx#PasskeySettings`, `src/components/settings/LanguageSettings.tsx` | Passkeys, app lock PIN, appearance and interface language |
| Profile | `src/components/profile/ProfileScreen.tsx#ProfileScreen`, `src/components/profile/UserAvatar.tsx`, `src/components/auth/SignOutDialog.tsx` | Photo or initials, name (editable), phone or email and plan; the onboarding answers (`contracts/profile-fields.ts`) with the same control as the Home card; call minutes left; sign out and account deletion (`profile.deleteMyAccount`) |
| Sign-in suggestion | `src/hooks/useBiometricOnboarding.ts`, `src/components/auth/BiometricOnboardingModal.tsx`, `src/hooks/usePasskeyEnrolment.ts` | The sheet that offers fingerprint / Face ID sign-in and registers the passkey in place |
| Client session | `src/hooks/useAuth.ts`, `src/providers/trpc.ts` | Who is signed in, the offline identity, tab sync, logout; the token header on every call |
| Google sign-in | the `/api/auth/google/start` and `/api/auth/google/callback` routes in `api/boot.ts`, `api/auth-router.ts` | OAuth with a state cookie, account creation, the `google_session` cookie |
| Google sign-in from the mobile app | `auth.signInWithGoogle` in `api/auth-router.ts`, `api/lib/google-id-token.ts` | Checks the ID token of the phone's Google SDK and answers a session token |
| Mobile app sign-in | `mobile/app/lib/src/features/auth/`, `PhoneChallengeEvents` in `mobile/packages/smartspend_api` | Phone login, sign-up with WhatsApp verification and Google in the Flutter app; the token in the Keychain or Keystore; the route guard |
| Phone accounts | `api/local-auth-router.ts`, `api/local-auth-utils.ts` | Register, login, WhatsApp verification codes, logout |
| Passkeys | `api/webauthn-router.ts` | Register a passkey while signed in, sign in with it |
| Sessions | `api/context.ts#createContext`, `api/lib/session-validation.ts`, `api/session-router.ts` | Resolving the caller from a token, the Redis cache, revocation |
| Login protection | `api/lib/login-protection.ts`, `api/lib/security-logger.ts` | Failure limits and backoff for phone logins, security events |
| Request security | `api/lib/security-headers.ts`, `api/lib/http-origin-security.ts`, `api/lib/origin-policy.ts`, `api/lib/get-client-ip.ts`, `api/lib/rate-limit.ts` | HTTPS, headers, allowed origins, client IP, rate limits |
| Data guards | `api/lib/ownership-guard.ts`, `api/lib/image-magic-bytes.ts`, `api/lib/anonymizer.ts`, `api/lib/admin-safe-fields.ts` | Referenced ids belong to the caller, uploads are real images, sensitive text is redacted, admin answers leave out credentials |
| Bot protection | `api/services/turnstile-service.ts` | The Cloudflare Turnstile check before a verification code |
| Account deletion | `api/services/user-purge-service.ts#purgeUserData` | Removes every row a user owns |

## Signing in

### Google
1. The Login screen asks `auth.googleUrl`, which points at `/api/auth/google/start` when Google is configured.
2. The start route builds the redirect address from the request's origin, which must be an allowed web origin, sets a
   random `oauth_state` cookie and the redirect address for ten minutes, and redirects to Google
   (`api/auth-router.ts#buildGoogleAuthorizationUrl`).
3. The callback route compares the state with the cookie in constant time and calls `auth.googleCallback`, which
   exchanges the code, finds the user by Google id or creates one with a referral code, updates the last sign-in and
   creates a session.
4. The route sets the `google_session` cookie (HttpOnly, seven days) and redirects to the dashboard; any failure
   returns to the login screen.
5. Both Google flows share the account step (`findOrCreateGoogleUser`, keyed by Google's account id in
   `users.union_id`) and the session step (`startGoogleSession`).

### Google, in the mobile app
A native app has no cookie to receive, so it signs in with the phone's own Google SDK (`google_sign_in`: Credential
Manager on Android, the Google Sign-In SDK on iOS) and sends the ID token it gets to `auth.signInWithGoogle`
(`strictPublicProcedure`, input `{ idToken }`).
1. `verifyGoogleIdToken` (`api/lib/google-id-token.ts`) checks the RS256 signature against Google's published keys
   (fetched with `jose` and cached; an unknown key id fetches them again), the issuer `accounts.google.com`, the expiry
   with a minute of tolerance, and a verified email.
2. It checks who the token was issued to. The app asks for a token for the server, so its audience (`aud`) is the web
   client `GOOGLE_CLIENT_ID`, or the iOS client when the iOS SDK signs in on its own; its authorized party (`azp`, or
   the audience when absent) must be one of `GOOGLE_ANDROID_CLIENT_IDS` or `GOOGLE_IOS_CLIENT_IDS` (comma-separated,
   for the store and dev builds). A token the website obtained for itself is refused.
3. With neither variable set the procedure answers `SERVICE_UNAVAILABLE`; a token that fails a check answers
   `UNAUTHORIZED`, and Google's keys being unreachable `SERVICE_UNAVAILABLE`. It logs `auth.google_id_token.*` with the
   reason or the user id, never the token or the email.
4. The account and session are made as in the redirect flow, and the token comes back in the answer; no cookie is set.

The app shows the Google button only when the build has `GOOGLE_SERVER_CLIENT_ID` (the web client id) and, on iOS,
`GOOGLE_IOS_CLIENT_ID` with its reversed form in `mobile/app/ios/Flutter/GoogleSignIn.xcconfig`.

### Phone number and password
- **Register** (`localAuth.register`): an Egyptian mobile number starting with 010, 011, 012 or 015
  (`api/local-auth-utils.ts#validatePhone`, Arabic digits accepted) that is not registered yet; a password of at least
  six characters, hashed with bcrypt; an optional referral code of another phone user. When `whatsapp_otp_enabled` is
  `true`, the request must carry the ticket of a challenge the bot verified for this very number, and the challenge is
  spent in the transaction that creates the account (see WhatsApp verification).
- **Login** (`localAuth.login`): the attempt passes login protection first; an unknown number is compared with a fixed
  hash, so it fails with the same message and takes as long as a wrong password.
- Both create a session, set the `smartspend_token` cookie (HttpOnly, seven days) and return the token, which the web
  app also keeps in `localStorage` and sends as a Bearer header.

### WhatsApp verification
Reverse verification: the user proves the number by sending a code to the bot from it, so the message is the proof
and the code only a label (`api/services/phone-challenge.ts`).
1. `localAuth.generateVerificationCode` passes the Turnstile check (`api/services/turnstile-service.ts`: in production
   only a token Cloudflare accepts, and nothing at all without `TURNSTILE_SECRET_KEY`), then limits counted across
   replicas: five codes per address in ten minutes, one per number a minute. It opens a challenge in
   `whatsapp_otp_codes`, valid for ten minutes, and returns its code (`SS-` and six digits), a `ticket` and a `watch`
   token, both HMACs of the row under a key derived from `JWT_SECRET`.
2. The Login screen shows the code with a WhatsApp link that sends it to the bot, and follows the challenge on
   `/api/sse/otp?challenge=<watch>`. The form shows the Turnstile widget when the build has `VITE_TURNSTILE_SITE_KEY`.
3. The bot (`receiveVerificationCode` in `api/services/whatsapp-service.ts`) finds the open challenge with that code
   and marks it verified only when the sender is the challenge's own number or its WhatsApp LID. A code from any
   other number is refused and counted, and three block the sender for 15 minutes. The page hears `verified`,
   `wrong_sender` or `expired`, never a phone number: at once when its stream reached the bot's process, and from the
   database within three seconds on any other replica.
4. On `verified` the page calls `localAuth.register` with the ticket; `localAuth.verifyOtp` does the same for an
   existing account and returns a session. Both spend the challenge with a conditional delete, so a ticket works
   once. Challenges nobody finished are deleted by the nightly `daily-auth-cleanup`.

The mobile app's sign-up (`RegisterScreen`) runs the same steps. It shows the Turnstile widget in a web view loaded as
the API's origin when the build has `TURNSTILE_SITE_KEY`, opens the `wa.me` link with url_launcher, and follows the
stream through `PhoneChallengeEvents`. The person leaves for WhatsApp in the middle, so `ChallengeFollower` opens the
stream again when the app returns to the foreground and after a dropped connection (2 to 30 seconds apart, a minute
after a 429), and stops at the challenge's deadline. A `wrong_sender` keeps it waiting for the right number instead of
ending the attempt.

### Passkeys
- In Settings, a signed-in user registers a passkey: `webauthn.generateRegistrationOptions` stores a five-minute
  challenge, the browser creates the credential, and `webauthn.verifyRegistration` checks it against the request's
  allowed origin and saves the public key and counter in `user_credentials`. Signed-in users can also revoke their
  passkey credentials via `webauthn.deletePasskey`.
- On the Login screen, `webauthn.generateAuthenticationOptions` and `webauthn.verifyAuthentication` sign in without a
  username: the credential is found by its id, its counter updated and a session created. A browser with a registered
  passkey displays a quick one-tap biometric login button and can auto-prompt on open.
- **The suggestion.** `useBiometricOnboarding` offers fingerprint / Face ID sign-in in one bottom sheet, named for the
  platform (Face ID on iPhone, fingerprint on Android, a passkey elsewhere): once when the app opens on Home, never in
  the tab where the account was just created (`SIGN_UP_SESSION_KEY`), never without a platform authenticator or with a
  passkey on the account, never over another open dialog, 14 days apart and never after two "Not now" (one close
  counts once) (`shouldShowBiometricPrompt` in
  `src/lib/biometricAuth.ts`). The record is kept in the profile preferences (`biometricPromptDismissals`,
  `biometricPromptLastShownAt`), so another device does not start over. The button registers the passkey right there
  (`usePasskeyEnrolment`, with the options fetched when the sheet opens so iOS keeps the tap); Settings › Security
  offers the same, highlighted by `?highlight=biometric` (or the older `1`). It writes no bell notification.

## Sessions
- **Token.** A JWT signed with `JWT_SECRET` (production refuses to start with one under 32 characters, as with
  `AI_GATEWAY_SECRET` and `RATE_LIMIT_KEY_SECRET` when they are set: `parseServerEnv` in `api/lib/env.ts`) that names the user and its type and expires after seven days
  (`generateToken`), plus a `sessions` row that stores only the SHA-256 hash of the token with its expiry, IP and user
  agent (`createSession`).
- **Resolving the caller** (`createContext`): a Bearer header first, then the `smartspend_token` or older
  `local_session` cookie, then the `google_session` cookie. The resolved user is cached in Redis for up to 15 minutes
  under the token hash together with the user's auth version. Without a cached copy, the JWT is verified, the session
  row must exist and be unexpired (`validateActiveSessionToken`), and the role and plan are read from the user table.
- **Revocation.** Logout deletes the session row and its cached copy and clears the cookies. Bumping the auth version
  (`bumpAuthVersion`) drops every cached session of a user at once; phone changes and `session.revokeMine` do it.
- **Cleanup.** `daily-auth-cleanup` deletes expired sessions and passkey challenges every night at midnight on replicas
  with `ENABLE_CRONS=true`.
- **In the browser** (`src/hooks/useAuth.ts`): both `auth.me` and `localAuth.me` are asked; a short offline snapshot
  keeps the name and plan visible without a network; logins and logouts are shared between tabs; logout clears the
  token, the offline queues and both server sessions.
- **In the mobile app** (`SessionController` in `mobile/app/lib/src/features/auth/session_controller.dart`): the token
  sits in `SessionStore` (Keychain or Keystore). On start the app opens the tabs on a stored token at once, even
  offline, and asks `auth.me` and `localAuth.me`; when both answer null, or any call that carried the token is refused
  as `UNAUTHORIZED` (`TrpcClient`'s `onSessionRejected`), it forgets the token and the router shows sign-in with
  «الجلسة خلصت». The router (`sessionRedirect`) lets a signed-out person reach only the sign-in screens. Sign-out calls
  `localAuth.logout`, which revokes the Bearer token's session of either kind, then clears the token.
- **App lock.** Settings can turn on a lock screen for this device (`src/providers/BiometricLockProvider.tsx`,
  `src/lib/biometricAuth.ts`): biometrics, or a four-digit PIN whose hash is kept in `localStorage`, with a short
  lockout after repeated wrong PINs. It hides the app on the device; the server session stays valid. Only the user
  turns it on: a passkey on the device no longer does (it used to, with no PIN to fall back on).

## Request security
Every HTTP request passes, in the order `api/boot.ts` mounts them:
1. `httpsRedirect` in production and `securityHeaders`: a content security policy for the app's own files, Cloudflare
   Turnstile, Google fonts and avatars; HSTS in production; no framing or MIME sniffing; the microphone only. In
   production scripts run only from the app's origin, Turnstile, and the two inline scripts of the built `index.html`,
   allowed by their SHA-256 hashes, which `builtIndexScriptHashes` reads once at boot; development keeps
   `'unsafe-inline'` for Vite.
2. `applyOriginSecurity`: a browser origin that is not allowed is refused before any handler runs, then CORS with
   credentials and a CSRF check for allowed origins. Allowed origins are exactly `APP_URL`, `FRONTEND_URL`,
   `ALLOWED_ORIGINS`, the local ports and the Capacitor shells (`createOriginPolicy`).

Then, per procedure:
- **Client IP** (`getClientIp`): the socket address, or the one header named in `TRUSTED_PROXY_HEADER` when
  `TRUST_PROXY` is on and the peer is loopback or listed in `TRUSTED_PROXY_IPS`.
- **Rate limits** (`api/middleware.ts`, `createRateLimiter`): per IP for public procedures, a stricter per-IP limit for
  registration, verification and passkey sign-in, and per user for signed-in and AI procedures; each limit counts both
  in Redis and in the process.
- **Login protection** (`beginLoginAttempt` and the functions after it): failures are counted per IP, per account and
  per IP-and-account pair in a sliding window, with a one-minute burst limit, a growing backoff for an account that
  keeps failing, and caps on attempts in flight. Keys are HMAC fingerprints; Redis holds the state with a bounded
  in-process fallback, and security events are logged with phone numbers, emails and tokens redacted.
- **Ownership** (`assertEntityOwnership` and its batch form): a wallet, business, goal or contact id that is not the
  caller's is refused (`api/AGENTS.md`, rule 2).
- **Uploads** (`verifyImageMagicBytes`): receipts must really be JPEG, PNG or WebP.
- **Redaction** (`redactSensitiveData`): card numbers, phone numbers, codes and names are removed from bank messages
  before they are stored or sent to a model.
- **Admin answers** select fields from `api/lib/admin-safe-fields.ts`, so credentials and session tokens never leave.

## Account changes and deletion
- `profile.updateUserInfo` changes the name and avatar. A new phone number needs a code: `profile.requestPhoneChange`
  sends one over WhatsApp when verification is on and keeps it for ten minutes as shared state (`stateSet` in
  `api/lib/redis-client.ts`: Redis, or the process's memory where there is no Redis), so the confirmation may reach any
  replica; `profile.confirmPhoneChange` checks it, saves the number, bumps the auth version and returns a one-time
  grant that `profile.updateUserInfo` also accepts for fifteen minutes.
- `purgeUserData` first locks the identity row, which delayed memory writers also lock; it deletes, inside the caller's transaction, every user-owned row (conversations and memory, the ledger,
  goals, contacts, sessions, passkeys, the profile, logs, voice usage and live calls with their incidents, and referrals)
  and then the identity row. `admin.deleteUser`, `localAuth.deleteUser` and `profile.deleteMyAccount` call it, then
  drop the cached principal (`invalidatePrincipal`), so a session resolved before the deletion stops answering at once;
  `tests/knowledge/architecture.test.ts` fails when a user-owned table is left out.
- **Deleting your own account** (`profile.deleteMyAccount`, the profile's "حذف الحساب"): the person types «احذف حسابي»
  (or "delete my account"; `contracts/account-deletion.ts`), and a phone account also gives its password, checked at
  most five times in fifteen minutes (a wrong one answers `BAD_REQUEST`, since the app reads `UNAUTHORIZED` as a
  session that ended). An admin is refused, so the console never loses its last admin by accident. The data is purged
  in one transaction, the session cookies are cleared, and the app then signs out as usual.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Google sign-in | the Google routes in `api/boot.ts`, `api/auth-router.ts` | |
| Google sign-in from the mobile app | `api/lib/google-id-token.ts`, `auth.signInWithGoogle` in `api/auth-router.ts`, the `GOOGLE_*_CLIENT_IDS` variables in `api/lib/env.ts`, `mobile/app/lib/src/features/auth/google_identity.dart` | `api/lib/google-id-token.test.ts`, `api/auth-router.google-id-token.test.ts`, `mobile/app/test/sign_in_screen_test.dart` |
| The mobile app's sign-in, sign-up and route guard | `mobile/app/lib/src/features/auth/`, `mobile/app/lib/src/routing/app_router.dart` | the tests in `mobile/app/test/` (`flutter test`) |
| Phone registration and login | `api/local-auth-router.ts`, `api/local-auth-utils.ts`, `src/pages/Login.tsx` | `api/local-auth-router.security.test.ts` |
| Proving a phone number | `api/services/phone-challenge.ts`, `receiveVerificationCode` in `api/services/whatsapp-service.ts`, `/api/sse/otp` in `api/boot.ts`, `src/pages/Login.tsx` | `api/local-auth-router.phone.test.ts`, `api/services/whatsapp-service.receive.test.ts`, `tests/phone-challenge.test.ts` (database) |
| The robot check | `api/services/turnstile-service.ts`, `src/components/auth/TurnstileWidget.tsx` | `tests/security/r3-turnstile-defense.test.ts` |
| Login limits | `api/lib/login-protection.ts` and the `LOGIN_*` variables in `api/lib/env.ts` | `api/lib/login-protection.test.ts`, `api/lib/login-protection.integration.test.ts` |
| Passkeys | `api/webauthn-router.ts`, `src/components/auth/PasskeySettings.tsx` | |
| How a request becomes a user | `api/context.ts`, `api/lib/session-validation.ts` | `tests/security/r5-session-hashing.test.ts`, `api/admin-authentication.security.test.ts` |
| Allowed origins and headers | `api/lib/origin-policy.ts`, `api/lib/security-headers.ts` | `api/lib/origin-policy.test.ts`, `tests/security/r7-security-headers.test.ts`, `tests/security/csp-inline-scripts.test.ts` |
| Rate limits | `api/middleware.ts`, `api/lib/rate-limit.ts` | `api/middleware.test.ts`, `api/lib/rate-limit.test.ts` |
| Ownership checks | `api/lib/ownership-guard.ts` | `tests/security/r6-bola-idor.test.ts` |
| What account deletion removes | `api/services/user-purge-service.ts` | `tests/knowledge/architecture.test.ts` |
| Deleting your own account | `profile.deleteMyAccount` in `api/profile-router.ts`, `contracts/account-deletion.ts`, `DeleteAccountSheet` in `src/components/profile/ProfileScreen.tsx` | `tests/account-self-deletion.test.ts` (MySQL), `src/components/profile/ProfileScreen.delete.test.tsx` |
| Secrets production accepts | `parseServerEnv` in `api/lib/env.ts` | `api/lib/env.test.ts` |

## Rules for changes here
1. Take the caller from `ctx.user`; never trust a user id from the input.
2. Store only hashes of anything that works as a credential, and select admin fields from the allowlists.
3. Registration, verification and sign-in procedures use `strictPublicProcedure`; phone logins go through login
   protection.
4. Role, plan and session writes go through `api/lib/access-control.ts`, which invalidates the cached
   principal in the same call; a phone change calls `invalidatePrincipal` for the same reason. Nothing else
   may write `role` or `plan` or delete a session (`tests/knowledge/architecture.test.ts`).
5. A new user-owned table is added to `purgeUserData`.
6. Never log tokens, codes or phone numbers (golden rule 10).
7. A phone number is proved only through `api/services/phone-challenge.ts`: the bot marks the challenge verified, and
   the ticket of the browser that started it spends it once. Never accept a phone number and a code from the client
   as proof.

## Tests
`api/local-auth-router.security.test.ts`, `api/local-auth-router.phone.test.ts`, `tests/phone-challenge.test.ts`
(database), `api/admin-authentication.security.test.ts`,
`api/admin-router.security.test.ts`, `api/business-router.security.test.ts`, `api/middleware.test.ts`,
`api/lib/login-protection.test.ts`, `api/lib/login-protection.integration.test.ts`, `api/lib/origin-policy.test.ts`,
`api/lib/get-client-ip.test.ts`, `api/lib/rate-limit.test.ts`, the suites in `tests/security/` and, for the app lock,
`src/providers/BiometricLockProvider.test.tsx` and `src/components/auth/BiometricAuth.test.tsx`. Google ID tokens:
`api/lib/google-id-token.test.ts` and `api/auth-router.google-id-token.test.ts`. The mobile app: `flutter test` in
`mobile/app` (sign-in, sign-up with verification, route guard, answer shapes) and `dart test` in
`mobile/packages/smartspend_api` (the client's session hook and the challenge stream).

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** Verification is the setting `whatsapp_otp_enabled` (shown and switched in the admin console's WhatsApp tab,
   [notifications](notifications.md)): while it is off any number registers without proof that it belongs to the person.
2. **Gap.** In production, verification needs both Turnstile keys: `TURNSTILE_SECRET_KEY` on the server and
   `VITE_TURNSTILE_SITE_KEY` in the web build. With verification on and either missing, nobody can sign up with a phone
   number.
3. **Gap.** Changing a phone number has no screen, and with verification off its code is never sent; the profile shows the
   number read-only.
4. **Gap.** Users cannot see or end their sessions: `session.listMine` and `session.revokeMine` have no screen.
5. **Security.** The phone-account token sits in `localStorage` and is sent as a Bearer header, where an injected script could read
   it (`src/AGENTS.md`, rule 4). In production the content security policy runs no inline script it does not know by
   hash, which narrows that risk without removing it.
6. **Gap.** The `localAuth` admin procedures and `session.trackEvent` have no screen or caller.
7. **Security.** The app lock's PIN is four digits hashed with a fixed salt in `localStorage`, and its lockout counter sits in the
   same storage.
8. **Gap.** Google sign-in in the mobile app is off until it is configured on both sides: `GOOGLE_ANDROID_CLIENT_IDS` or
   `GOOGLE_IOS_CLIENT_IDS` on the server, `GOOGLE_SERVER_CLIENT_ID` (and on iOS `GOOGLE_IOS_CLIENT_ID` with the reversed id
   in `GoogleSignIn.xcconfig`) in the app build. None of these values is set yet, so the app hides the button.
9. **Gap.** In the mobile app Turnstile runs in a web view loaded as the API's origin, so the site key must list the
   API's host. A build without `TURNSTILE_SITE_KEY` sends no token, and a production server with verification on then
   refuses its sign-ups, as known issue 2 says for the web.
10. **Security.** `auth.signInWithGoogle` asks for no nonce: an ID token issued to the app signs in whoever presents it
    until it expires, about an hour after Google issued it.
11. **Gap.** The mobile app has no passkey sign-in, and neither the app nor the web's Login screen offers WhatsApp
    sign-in (`localAuth.verifyOtp`).

## Related systems
- [Notifications and WhatsApp](notifications.md): the WhatsApp bot that receives the codes, and push subscriptions.
- [Server platform and data](platform.md): the Hono app, the order of its middleware, Redis.
- [Admin console, support and growth tools](admin.md): user management, roles and deletion.
- [Plans and payments](billing.md): the plan stored on the user.
- [Money](money.md): the people and business screens inside Settings.
- [Web and mobile app shell](web-app.md): route guards, the More page and the app lock provider.
