# Handoff Report — Milestone 1: RBAC, Passkeys & Cascading Deletion Security Audit

> **Agent:** Explorer 3 (`explorer_m1_3`)  
> **Working Directory:** `E:/smartspend_V1_fixed/.agents/explorer_m1_3/`  
> **Target Milestone:** Milestone 1 (RBAC, Passkeys & Cascading Deletion Security Audit)  
> **Date:** August 23, 2026  
> **Status:** Completed (Hard Handoff)

---

## 1. Observation

1. **RBAC Isolation & Gating:**
   - In `api/middleware.ts:97-126`, `moderatorProcedure` verifies `ctx.user.role === "admin" || ctx.user.role === "moderator"`, `adminProcedure` verifies `ctx.user.role === "admin"`, `proProcedure` verifies `ctx.user.plan === "pro" || ctx.user.plan === "ultra" || ctx.user.role === "admin"`, and `ultraProcedure` verifies `ctx.user.plan === "ultra" || ctx.user.role === "admin"`.
   - `ultraProcedure` is exported in `api/middleware.ts:121` but is not imported or used anywhere across the entire backend router directory.
   - In `api/business-router.ts:2, 52-400`, all endpoints (`get`, `types`, `suggestCategories`, `create`, `update`, `delete`, `addCategory`, `updateCategory`, `removeCategory`, `linkContact`) are defined with `authedProcedure` instead of `proProcedure`.
   - In `api/business-router.ts:112-172`, `suggestCategories` executes Google Gemini AI generations (`gemini-3.1-flash-lite`) via `authedProcedure`, bypassing both `proProcedure` plan authorization and `aiProcedure` rate limiting.
   - In `api/ai-router.ts:1988, 2960, 3127`, `generateMonthlyInsights`, `compareMonths`, and `generateYearlyInsights` are protected by `authedProcedure` rather than `aiProcedure`.

2. **WebAuthn Passkeys Flow:**
   - In `api/webauthn-router.ts:31-36`, `rpID` is hardcoded as `process.env.NODE_ENV === "production" ? "smartspend.ai" : "localhost"` and `origin` as `process.env.NODE_ENV === "production" ? "https://smartspend.ai" : "http://localhost:5173"`.
   - In `api/webauthn-router.ts:38-306`, there are 5 procedures: `checkHasPasskey`, `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`. There are no procedures to list user passkeys or revoke/delete credentials.
   - In `api/webauthn-router.ts:164-173`, registration inserts directly into `userCredentials` without handling duplicate key collisions.

3. **Cascading Deletion & Orphaned Data:**
   - In `api/admin-router.ts:360-384`, `deleteUser` deletes from only 17 tables (`expenses`, `sessions`, `userAnalytics`, `supportTickets`, `userWallets`, `proSubscriptions`, `monthlyReports`, `aiSummaries`, `userProfiles`, `profileLearningEvents`, `monthlyBehaviorSnapshots`, `userDictionaries`, `classificationLogs`, `voiceUsage`, `webhookTokens`, `rawSmsEvents`, `expenseCategories`, `pushSubscriptions`, `pendingClarifications`). It omits 18 user-scoped tables: `financialGoals`, `userBudgets`, `userBusinesses`, `businessCategories`, `userContacts`, `adClicks`, `userCredentials`, `authChallenges`, `chatConversations`, `chatMessages`, `aiConversationSummaries`, `aiMemoryItems`, `aiMemoryEmbeddings`, `aiActionMemory`, `aiPendingActions`, `aiActionAuditLogs`, `inAppNotifications`, `notificationLogs`, `referrals`, `apiKeyErrors`.
   - In `api/local-auth-router.ts:348-372`, `deleteUser` deletes from 22 tables but omits 17 user-scoped tables: `pushSubscriptions`, `pendingClarifications`, `businessCategories`, `userCredentials`, `authChallenges`, `chatConversations`, `chatMessages`, `aiConversationSummaries`, `aiMemoryItems`, `aiMemoryEmbeddings`, `aiActionMemory`, `aiPendingActions`, `aiActionAuditLogs`, `inAppNotifications`, `notificationLogs`, `referrals`, `apiKeyErrors`.
   - In `api/profile-router.ts`, no `deleteAccount` or `deleteMe` endpoint exists.
   - In `api/goals-router.ts:297-305`, `goalsRouter.delete` deletes from `financialGoals` without updating `userBudgets.linkedGoalId`.
   - In `api/ads-router.ts:119-124`, `adsRouter.delete` deletes from `ads` without deleting child rows from `adClicks`.
   - In `api/business-router.ts:281-315`, `delete` executes 4 separate deletion/update queries outside `db.transaction()`.
   - In `api/profile-router.ts:666-743`, `deleteContact` updates profiles, nullifies expense contacts, and deletes contacts outside `db.transaction()`.
   - In `api/chat-router.ts:1133-1163`, `clearConversation` deletes `chatMessages` and `chatConversations` sequentially outside `db.transaction()`, omitting `aiConversationSummaries`.

4. **Dual-Auth & Context Discrepancies:**
   - In `api/context.ts:138-147`, local user resolution in `createContext` omits `avatar: dbUser.avatar`.
   - In `api/local-auth-router.ts:128`, `register` inserts raw `input.phone` rather than `cleanPhone`, while `login` on line 227 queries by `cleanPhone`.
   - In `api/sms-router.ts:133-166`, `getUserFromSession` verifies JWT signature but fails to check the `sessions` database table for revocation.

---

## 2. Logic Chain

1. **From RBAC Observations to Elevation Findings:**
   - Because `api/business-router.ts` imports and uses `authedProcedure` on all routes (Observation 1), any user with a `free` plan can create businesses, create custom business categories, and invoke Google Gemini AI to auto-generate categories via `suggestCategories` (Observation 1).
   - This violates the system architecture specification where Business Mode and autonomous category generation are Pro features.
   - Because `ultraProcedure` is never referenced in any router (Observation 1), the platform has no procedural mechanism distinguishing Ultra features from Pro features.

2. **From WebAuthn Observations to Passkey Flaws:**
   - Because `origin` is hardcoded to `"http://localhost:5173"` in development and `"https://smartspend.ai"` in production (Observation 2), any deployment utilizing preview subdomains, non-standard development ports, or mobile webhook tunnels will fail WebAuthn cryptographic origin verification.
   - Because there is no procedure to list or delete passkeys in `webauthn-router.ts` (Observation 2), users who lose an authenticator device cannot revoke the corresponding credential, leaving a permanent attack surface if the device is compromised.

3. **From Deletion Code to Data Leak / Orphan Conclusions:**
   - Out of 35 user-scoped tables across the 48-table schema, `adminRouter.deleteUser` deletes from 19 and `localAuthRouter.deleteUser` deletes from 22 (Observation 3).
   - The missed tables include biometric credentials (`userCredentials`, `authChallenges`), complete conversational threads and tool traces (`chatConversations`, `chatMessages`), persistent semantic memories and embeddings (`aiMemoryItems`, `aiMemoryEmbeddings`), autonomous action history (`aiActionMemory`, `aiPendingActions`, `aiActionAuditLogs`), and business categories (`businessCategories`).
   - Because MySQL cannot enforce native polymorphic foreign key cascades across dual user tables (`users` and `localUsers`), any table omitted from the application-level deletion query remains indefinitely in the database.
   - This creates severe privacy leaks, GDPR violations, and phantom data retention.

4. **From Entity Mutation Observations to ACID Boundary Flaws:**
   - `businessRouter.delete`, `profileRouter.deleteContact`, `profileRouter.mergeContacts`, and `chatRouter.clearConversation` execute multi-table mutations sequentially without `db.transaction()` (Observation 3).
   - A server restart, network glitch, or database failure mid-operation leaves orphaned foreign keys and corrupted data relationships.

---

## 3. Caveats

- **No Caveats:** All findings were directly verified against the repository source code (`api/middleware.ts`, `api/webauthn-router.ts`, `api/admin-router.ts`, `api/local-auth-router.ts`, `api/profile-router.ts`, `api/context.ts`, `db/schema.ts`, `db/relations.ts`).

---

## 4. Conclusion

The RBAC, WebAuthn, and Cascading Deletion audit reveals:
1. **Critical Deletion Deficiencies:** Over 17 user-scoped tables are orphaned on user deletion due to fragmented and incomplete deletion routines across `adminRouter` and `localAuthRouter`.
2. **Monetization & Rate Limit Bypasses:** `businessRouter` exposes Pro features and AI category generation to Free users without procedure-level plan or AI rate limit enforcement.
3. **WebAuthn Passkey Rigidity:** Hardcoded origin strings and absence of credential management procedures create authentication fragility and security administration gaps.
4. **ACID Mutation Gaps:** Entity deletions across contacts, businesses, and chats operate outside database transactions.

---

## 5. Verification Method

### 1. Code Inspection
- Inspect `api/admin-router.ts:360-384` and `api/local-auth-router.ts:348-372` to verify missing tables.
- Inspect `api/business-router.ts:52, 112, 174` to verify `authedProcedure` usage.
- Inspect `api/webauthn-router.ts:31-36` to verify hardcoded `rpID` and `origin`.
- Inspect `api/context.ts:138-147` to verify local user avatar omission.
- Inspect `api/local-auth-router.ts:128` to verify uncleaned phone number persistence.

### 2. Monorepo Verification Commands
```bash
# Type check monorepo
npm run check

# Full test suite
npm test
```

### 3. Invalidation Conditions
- This audit report is invalidated if a centralized `purgeUserAccount()` transaction service is implemented and integrated across all user deletion paths, or if `businessRouter` procedures are upgraded to `proProcedure`.

---

*Handoff written by Explorer 3 (`explorer_m1_3`). Full audit report available at `E:/smartspend_V1_fixed/.agents/explorer_m1_3/audit_rbac_cascades.md`.*
