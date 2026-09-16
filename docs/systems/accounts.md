# Accounts, sign-in and security

How people get in and stay in: Google sign-in, phone numbers with passwords, passkeys, sessions and logout, the app
lock on the device, and the protections every request passes through (origins, headers, client IP, rate limits, login
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
| Settings | `src/pages/Settings.tsx#Settings`, `src/components/profile/SmartProfileSettings.tsx#SmartProfileSettings`, `src/components/auth/PasskeySettings.tsx#PasskeySettings` | Name, avatar and profile; passkeys and the app lock PIN |
| Client session | `src/hooks/useAuth.ts`, `src/providers/trpc.ts` | Who is signed in, the offline identity, tab sync, logout; the token header on every call |
| Google sign-in | the `/api/auth/google/start` and `/api/auth/google/callback` routes in `api/boot.ts`, `api/auth-router.ts` | OAuth with a state cookie, account creation, the `google_session` cookie |
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

### Phone number and password
- **Register** (`localAuth.register`): an Egyptian mobile number starting with 010, 011, 012 or 015
  (`api/local-auth-utils.ts#validatePhone`, Arabic digits accepted) that is not registered yet; a password of at least
  six characters, hashed with bcrypt; an optional referral code of another phone user. When `whatsapp_otp_enabled` is
  `true`, the number must have been verified first.
- **Login** (`localAuth.login`): the attempt passes login protection first; an unknown number is compared with a fixed
  hash, so it fails with the same message and takes as long as a wrong password.
- Both create a session, set the `smartspend_token` cookie (HttpOnly, seven days) and return the token, which the web
  app also keeps in `localStorage` and sends as a Bearer header.

### WhatsApp verification
Designed as reverse verification. `localAuth.generateVerificationCode` passes the Turnstile check and per-IP and
per-number limits, then keeps a code (`SS-` and six digits) for ten minutes in `api/services/otp-cache.ts`. The user
is meant to send that code to the bot from the same number: `api/services/whatsapp-service.ts` marks it verified when
the sender matches, records a different sender as fraud, blocks a sender after three wrong codes for 15 minutes, and
emits an event that the Login screen hears through `/api/sse/otp` before it registers. The flow does not complete
today; see the known issues.

### Passkeys
- In Settings, a signed-in user registers a passkey: `webauthn.generateRegistrationOptions` stores a five-minute
  challenge, the browser creates the credential, and `webauthn.verifyRegistration` checks it against the request's
  allowed origin and saves the public key and counter in `user_credentials`.
- On the Login screen, `webauthn.generateAuthenticationOptions` and `webauthn.verifyAuthentication` sign in without a
  username: the credential is found by its id, its counter updated and a session created. A browser that registered a
  passkey opens the prompt by itself.

## Sessions
- **Token.** A JWT signed with `JWT_SECRET` that names the user and its type and expires after seven days
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
- **App lock.** Settings can turn on a lock screen for this device (`src/providers/BiometricLockProvider.tsx`,
  `src/lib/biometricAuth.ts`): biometrics, or a four-digit PIN whose hash is kept in `localStorage`, with a short
  lockout after repeated wrong PINs. It hides the app on the device; the server session stays valid.

## Request security
Every HTTP request passes, in the order `api/boot.ts` mounts them:
1. `httpsRedirect` in production and `securityHeaders`: a content security policy for the app's own files, Cloudflare
   Turnstile, Google fonts and avatars; HSTS in production; no framing or MIME sniffing; the microphone only.
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
  sends one over WhatsApp when verification is on, and `profile.confirmPhoneChange` checks it, saves the number and
  bumps the auth version.
- `purgeUserData` deletes, inside the caller's transaction, every user-owned row (conversations and memory, the ledger,
  goals, contacts, sessions, passkeys, the profile, logs and referrals) and then the identity row. `admin.deleteUser`
  and `localAuth.deleteUser` call it; `tests/knowledge/architecture.test.ts` fails when a user-owned table is left out.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Google sign-in | the Google routes in `api/boot.ts`, `api/auth-router.ts` | |
| Phone registration and login | `api/local-auth-router.ts`, `api/local-auth-utils.ts`, `src/pages/Login.tsx` | `api/local-auth-router.security.test.ts` |
| Login limits | `api/lib/login-protection.ts` and the `LOGIN_*` variables in `api/lib/env.ts` | `api/lib/login-protection.test.ts`, `api/lib/login-protection.integration.test.ts` |
| Passkeys | `api/webauthn-router.ts`, `src/components/auth/PasskeySettings.tsx` | |
| How a request becomes a user | `api/context.ts`, `api/lib/session-validation.ts` | `tests/security/r5-session-hashing.test.ts`, `api/admin-authentication.security.test.ts` |
| Allowed origins and headers | `api/lib/origin-policy.ts`, `api/lib/security-headers.ts` | `api/lib/origin-policy.test.ts`, `tests/security/r7-security-headers.test.ts` |
| Rate limits | `api/middleware.ts`, `api/lib/rate-limit.ts` | `api/middleware.test.ts`, `api/lib/rate-limit.test.ts` |
| Ownership checks | `api/lib/ownership-guard.ts` | `tests/security/r6-bola-idor.test.ts` |
| What account deletion removes | `api/services/user-purge-service.ts` | `tests/knowledge/architecture.test.ts` |

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

## Tests
`api/local-auth-router.security.test.ts`, `api/admin-authentication.security.test.ts`,
`api/admin-router.security.test.ts`, `api/business-router.security.test.ts`, `api/middleware.test.ts`,
`api/lib/login-protection.test.ts`, `api/lib/login-protection.integration.test.ts`, `api/lib/origin-policy.test.ts`,
`api/lib/get-client-ip.test.ts`, `api/lib/rate-limit.test.ts`, the suites in `tests/security/` and, for the app lock,
`src/providers/BiometricLockProvider.test.tsx` and `src/components/auth/BiometricAuth.test.tsx`.

## Known issues
Checked against the code; each one names where it lives.
1. **Bug.** Phone sign-up with WhatsApp verification cannot finish: `localAuth.generateVerificationCode` never returns the code
   the Login screen tells the user to send, so the WhatsApp message carries an empty code, and "skip" calls
   `localAuth.register`, which refuses a number that is not verified. With `whatsapp_otp_enabled` off, any number can
   register without proof that it belongs to the person.
2. **Security.** In production the code request is refused, because the web app sends no Turnstile token; meanwhile
   `verifyTurnstileToken` accepts Cloudflare's public always-pass test token without asking Cloudflare.
   `tests/security/r3-turnstile-defense.test.ts` tests its own copy of these functions, not
   `api/services/turnstile-service.ts`.
3. **Security.** `localAuth.verifyOtp` creates a session for a phone number and a matching code without checking that the code was
   confirmed over WhatsApp. No screen uses it and codes never leave the server today, but returning the code to the
   client, the obvious repair for issue 1, would let anyone who requests a code for a number sign in as its owner.
4. **Bug.** Verification codes, their limits and the sender blocklist live in process memory (`api/services/otp-cache.ts`), so
   verification fails when requests reach different replicas (`api/AGENTS.md`, rule 6).
5. **Bug.** Saving the profile in Settings never changes the name or avatar, and says nothing: `SmartProfileSettings` always
   sends the phone field, which `profile.updateUserInfo` rejects without a code (and rejects when empty, for Google
   users). Changing a phone number has no screen, and with verification off its code is never sent.
6. **Gap.** A passkey cannot be removed; users cannot see or end their sessions (`session.listMine` and `session.revokeMine`
   have no screen) or delete their own account.
7. **Security.** The phone-account token sits in `localStorage` and is sent as a Bearer header, where an injected script could read
   it, while the content security policy allows inline scripts (`src/AGENTS.md`, rule 4).
8. **Security.** `/api/sse/otp` answers for any phone number without signing in, sends the sender's number in its fraud event, and
   never prunes its per-IP counters.
9. **Gap.** The `localAuth` admin procedures and `session.trackEvent` have no screen or caller.
10. **Security.** The app lock's PIN is four digits hashed with a fixed salt in `localStorage`, and its lockout counter sits in the
    same storage.
11. **Security.** `api/services/whatsapp-service.ts` logs the codes it receives, whole incoming messages and the senders' phone
    numbers (golden rule 10).

## Related systems
- [Notifications and WhatsApp](notifications.md): the WhatsApp bot that receives the codes, and push subscriptions.
- [Server platform and data](platform.md): the Hono app, the order of its middleware, Redis.
- [Admin console, support and growth tools](admin.md): user management, roles and deletion.
- [Plans and payments](billing.md): the plan stored on the user.
- [Money](money.md): the people and business screens inside Settings.
- [Web and mobile app shell](web-app.md): route guards, the More page and the app lock provider.
