# Handoff Report: Security Survey (R5, R6, R8)
**Date:** 2026-09-08  
**Surveyor Agent:** Survey Explorer 3 (`explorer_sec_r5_r6_r8`)  
**Parent Agent:** `orchestrator` (`472de1c9-5556-417b-8df1-292ac29591a9`)  
**Full Report:** `e:/smartspend_V1_fixed/.agents/explorer_sec_r5_r6_r8/report.md`  

---

## 1. Observation

Direct observations from codebase inspection:
1. **Plaintext Session Token Storage (`db/schema.ts:314`, `api/local-auth-utils.ts:70`)**:
   - `sessions.token` is defined as `varchar("token", { length: 500 })` and indexed (`sessions_token_idx`).
   - `createSession()` in `api/local-auth-utils.ts:70` inserts raw plaintext JWT `token` on every login/register.
   - `validateActiveSessionToken` in `api/lib/session-validation.ts:181` performs a fallback lookup using `or(eq(sessions.tokenHash, tokenHashHex), eq(sessions.token, token))`.
   - `logout` in `api/local-auth-router.ts:359` queries `where(eq(sessions.token, token))` directly.
   - `api/admin-authentication.security.test.ts:66` explicitly expects `query.sql` to contain `\`sessions\`.\`token\` = ?`.
2. **Plaintext Webhook Token Storage (`db/schema.ts:690`, `api/sms-router.ts:182, 556, 775`)**:
   - `webhookTokens.token` is stored as plaintext `varchar(255)`.
   - `/api/sms/ingest` and `/api/sms/android-status` look up raw tokens via `where(eq(webhookTokens.token, token))`.
3. **Hardcoded Fallback Static Secrets**:
   - `api/notification-engine.ts:267-268`: Hardcoded static VAPID public and private keys `"BBtKP6w9...` and `"-31rwR0L...`.
   - `api/lib/ai-gateway.ts:112`: Hardcoded fallback key `"smartspend-ai-gateway-secure-vault-key-32"`.
4. **Broken Object Level Authorization (BOLA/IDOR)**:
   - `api/expense-router.ts:467-468, 535-536, 626-627, 691-692`: In `expense.create` and `expense.batchCreate`, inputs accept `walletId` and `businessId`. Both are inserted directly into `expenses` without verifying ownership against `userWallets` or `userBusinesses`. (While `contactId` and `classificationLogId` are verified in `resolveBatchExpenseReferences`, `walletId` and `businessId` are completely unverified).
   - `api/budget-router.ts:114, 126`: In `budget.create`, `linkedGoalId` is inserted directly without verifying ownership against `financialGoals`.
   - `api/profile-router.ts:630, 653, 668, 695`: In `addContact` and `updateContact`, `businessId` is accepted and set without verifying ownership against `userBusinesses`.
5. **Cookie & Profile Security Boundaries**:
   - `api/local-auth-router.ts:172, 321`: `login` and `register` only return tokens in JSON bodies; browser clients store tokens in `localStorage`.
   - `api/profile-router.ts:38-43, 267, 271`: `smartProfilePatchSchema` uses `z.record(z.string(), z.any())` for `basicInfo`, `financialInfo`, `lifestyleInfo`, `preferences`, etc.
   - `api/profile-router.ts:340, 355`: `updateUserInfo` directly updates `localUsers.phone` with zero OTP verification or duplicate phone check.
   - `api/image-router.ts:58-70` & `api/lib/receipt-image-parser.ts:54-58`: `parseReceipt` receives base64 string and validates length, but has zero binary magic bytes verification.

---

## 2. Logic Chain

1. **R5 Logic Chain**:
   - Because `sessions.token` is populated on every login and `validateActiveSessionToken` queries it, any database read leak compromises all active JWTs (Observation 1).
   - Eliminating the plaintext column write, querying solely by `tokenHash`, and updating `logout` and test assertions ensures that only cryptographic SHA-256 hashes are ever persisted or searched.
   - Because `webhook_tokens.token` is in plaintext (Observation 2), storing `tokenHash` (SHA-256) for O(1) ingestion lookup, and storing `encryptedToken` (AES-256-GCM) for authenticated display, eliminates plaintext token exposure.
   - Eliminating hardcoded VAPID strings in `notification-engine.ts` and static vault key in `ai-gateway.ts` (Observation 3) prevents credential harvesting from git or binary inspection.
2. **R6 Logic Chain**:
   - In `expenseRouter`, `budgetRouter`, and `profileRouter`, users supply foreign keys (`walletId`, `businessId`, `linkedGoalId`) in mutation inputs (Observation 4).
   - Because these foreign keys are stored directly without checking `where(userId = ctx.user.id)`, an authenticated attacker can associate their records with another user's wallet, business, or financial goal, causing data contamination and cross-tenant leakage.
   - Introducing batched validation in `resolveBatchExpenseReferences` and dedicated ownership assertions in `budgetRouter` and `profileRouter` guarantees rejection of unauthorized foreign keys.
3. **R8 Logic Chain**:
   - Storing JWTs only in `localStorage` leaves sessions vulnerable to XSS theft (Observation 5). Transmitting `smartspend_token` as an `HttpOnly; SameSite=Lax` cookie while continuing to return the token in JSON provides XSS resilience for web browsers while maintaining 100% backward compatibility for companion mobile apps.
   - Unrestricted `z.any()` in profile schemas allows injection of unbounded or malicious structures (Observation 5). Constraining fields with strict schemas enforces data integrity.
   - Allowing unverified phone changes enables account takeover or collision (Observation 5). A 2-step OTP workflow ensures only proven phone owners can update this primary identity field.
   - Lacking magic bytes validation allows malicious executables disguised as images to enter vision pipelines (Observation 5). Enforcing initial byte verification (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, WebP: `RIFF...WEBP`) blocks disguised payloads before processing.

---

## 3. Caveats

- **Existing Plaintext Sessions in Production**: If there are active production sessions created before migration 0021 that lack `token_hash`, a one-time migration or rolling session invalidation will log those users out once fallback plaintext lookup is removed.
- **Companion App Android APK & iOS Shortcuts**: The companion apps send the webhook token either as a Bearer token or as a URL query parameter. Hashing incoming tokens with SHA-256 on `/api/sms/ingest` is 100% transparent to clients, but the server must compute `createHash("sha256").update(token).digest("hex")` before querying `webhookTokens`.
- **Phone Number Change Flow**: The 2-step OTP flow relies on `otpCache` and `whatsappService`. In development or CI where WhatsApp is disabled, a test OTP code (or development bypass) must be supported.

---

## 4. Conclusion

The security flaws in R5, R6, and R8 represent significant security risks (P1/P2), but their remediation can be implemented cleanly with zero breaking changes to client interfaces:
1. **R5**: Transition `sessions` and `webhookTokens` to hash-only lookup (`tokenHash`), store webhook tokens encrypted with AES-256-GCM, and purge hardcoded fallback credentials.
2. **R6**: Enforce ownership verification for `walletId` and `businessId` in `expenseRouter`, `linkedGoalId` in `budgetRouter`, and `businessId` in `profileRouter`.
3. **R8**: Implement dual-mode cookie/bearer authentication, replace `z.any()` in `smartProfilePatchSchema` with bounded scalar/array schemas, enforce verified OTP on phone changes, and add binary magic bytes validation for uploaded receipt images.

---

## 5. Verification Method

To verify the remediations independently once implemented:
1. **Type Safety & Build**:
   ```powershell
   npm run check
   ```
2. **Unit & Security Test Suites**:
   ```powershell
   npx vitest run api/admin-authentication.security.test.ts
   npx vitest run api/business-router.security.test.ts
   npx vitest run api/local-auth-router.security.test.ts
   npx vitest run tests/auth-hot-path.test.ts
   npm run test
   ```
3. **BOLA Verification**:
   - Attempt `expense.create({ walletId: foreignWalletId })` -> expect `NOT_FOUND` / unauthorized error.
   - Attempt `budget.create({ linkedGoalId: foreignGoalId })` -> expect `NOT_FOUND` / unauthorized error.
   - Attempt `profile.addContact({ businessId: foreignBusinessId })` -> expect `NOT_FOUND` / unauthorized error.
4. **Magic Bytes Verification**:
   - Call `image.parseReceipt` with base64 of non-image file (e.g. text string or shell script) -> expect `BAD_REQUEST` error rejecting invalid image header.
