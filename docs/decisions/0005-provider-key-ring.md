# 0005. Provider keys: a key ring over the existing format, resealed on load

- Status: accepted, implemented in `api/lib/provider-key-crypto.ts`.
- Decided and recorded: 2026-09-18.

## Context
The admin console stores each AI provider's key in `ai_providers.api_key_encrypted`, sealed with AES-256-GCM under
SHA-256 of `AI_GATEWAY_SECRET`, or of `JWT_SECRET` when that is unset, as `<iv>:<tag>:<data>` in hex. Most
installations never set `AI_GATEWAY_SECRET`, so the keys depended on `JWT_SECRET`, and the owner plans to rotate
`JWT_SECRET`. Nothing recorded which secret sealed a key, a key that no longer opened was dropped from routing without
a word, and the Docker image cannot run a one-off migration script (it holds `dist` only).

The obvious fix, a versioned format such as `v1:<keyId>:...`, was rejected: the previous release reads any value that
is not exactly three colon-separated parts as plain text. Rolling back after the rows were rewritten, or an older
replica serving during a deploy, would send the new ciphertext to providers as if it were the key.

## Decision
1. Keep the stored format and the SHA-256 derivation byte for byte, so the previous release reads what this one writes.
2. Open a stored key with a ring of secrets, in order: `AI_GATEWAY_SECRET`, `AI_GATEWAY_SECRET_PREVIOUS`, `JWT_SECRET`.
   GCM authenticates, so a wrong secret fails instead of returning noise; the secret that opened a key is known without
   storing it.
3. Seal new keys with the first secret of the ring. Reseal any key opened with a later one, or stored as plain text,
   whenever the providers are loaded — at boot and on every route-cache refresh — with a write conditional on the stored
   value being unchanged, so concurrent replicas and admin edits cannot overwrite each other.
4. Report a key no secret opens: in the log once per process, and on the provider's card in the admin console, where
   the key can be entered again without deleting the provider.
5. Both variables are optional. Requiring `AI_GATEWAY_SECRET` would stop a production server that runs today without it;
   the console and a boot warning say instead that the keys still depend on `JWT_SECRET`.

## Consequences
- Setting `AI_GATEWAY_SECRET` and deploying is the whole migration; afterwards `JWT_SECRET` can rotate freely.
  Rotating `AI_GATEWAY_SECRET` is: old value into `AI_GATEWAY_SECRET_PREVIOUS`, new value into `AI_GATEWAY_SECRET`,
  deploy, remove the old value once no key shows it.
- Rotating `JWT_SECRET` before `AI_GATEWAY_SECRET` is set still loses the keys; the difference is that the console says
  so and offers to take the key again.
- A future change of algorithm or format needs a release that reads both formats before any release writes the new
  one.
- The load path writes to `ai_providers` when a key needs moving. The write is idempotent and never fails the refresh.
