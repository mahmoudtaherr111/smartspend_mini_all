# 0036. Google sign-in from the app is bound to one sign-in by a nonce the app makes

- Status: accepted. Built in `api/lib/google-id-token.ts` (`googleNonceHash`, the `nonce` check), `stateClaim` in
  `api/lib/redis-client.ts`, `auth.signInWithGoogle` in `api/auth-router.ts`, and `newGoogleNonce`,
  `googleNonceHash` and `PluginGoogleIdentity.requestCredential` in
  `mobile/app/lib/src/features/auth/google_identity.dart`.
- Decided and recorded: 2026-10-29, from security known issue 10 of the accounts page.

## Context
`auth.signInWithGoogle` accepted any valid Google ID token issued to the app's Android or iOS client. Such a token
stays valid for about an hour, so whoever got hold of one (a log, a crash report, a compromised phone) could sign in
as its owner until it expired.

OpenID Connect's answer is the `nonce` claim: the client puts a value into the sign-in request and Google copies it
into the token. Two ways exist to make the value: the server issues it (one more round trip and a stored challenge
before the account picker opens), or the app makes it and gives Google only its hash, sending the value itself to the
server (the way Supabase and Firebase take native ID tokens). No build with Google sign-in is in anyone's hands yet:
no native client id is configured on any server, and the app hides the button without one.

## Decision
1. **The app makes the value.** For each sign-in, 32 random bytes from `Random.secure`, base64url without padding.
   Google gets its SHA-256 in lowercase hex; the server gets the value. A token alone, wherever it leaked, carries only
   the hash.
2. **The server checks it and spends it once.** The token's `nonce` must equal the hash of the value sent
   (constant-time comparison), and after every other check the hash is marked used with Redis `SET NX` for an hour and
   a minute, longer than any token lives. A second request with the same token and value is refused as `replayed`. A
   token that fails a check spends nothing.
3. **The nonce is required.** The input is `{ idToken, nonce }` with a nonce of 32 to 128 characters. There is no
   older client to keep working.
4. **Each sign-in gets its own nonce on the phone.** `google_sign_in` 7 takes the nonce only when it is initialized,
   and its app-facing `initialize` may be called only once. The app keeps that one call and, before each
   `authenticate`, calls the platform's `init` (`GoogleSignInPlatform.instance.init`) again with the new hash: the
   Android implementation only stores its parameters and the iOS one configures the SDK again. This makes
   `google_sign_in_platform_interface` (Flutter team, already in the lockfile through `google_sign_in`) a direct
   dependency of the app.

## Consequences
- A replayed or leaked token no longer signs anyone in; the cost is one Redis key per Google sign-in for an hour.
- Without Redis the mark is kept in the process (as the other shared state is), so with several replicas and no
  Redis a value could be spent once per replica; running more than one process already requires Redis (decision 0013).
- If a future `google_sign_in` stops accepting a second platform `init`, the per-sign-in nonce has to move to whatever
  that version offers; the server side does not change.
