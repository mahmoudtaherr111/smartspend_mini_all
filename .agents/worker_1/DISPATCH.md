## 2026-08-23T18:22:01Z

You are Worker 1 implementing Milestone 1 for the SmartSpend AI remediation project.
Your working directory is: E:/smartspend_V1_fixed/.agents/worker_1

Authoritative files to read first:
- E:/smartspend_V1_fixed/ORIGINAL_REQUEST.md
- E:/smartspend_V1_fixed/MASTER_ROOT_CAUSE_CATALOG.md
- E:/smartspend_V1_fixed/AGENTS.md
- E:/smartspend_V1_fixed/PROJECT.md
- Explorer 2 Analysis: E:/smartspend_V1_fixed/.agents/explorer_2/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A forensic auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You EXCLUSIVELY own and may modify these files:
- E:/smartspend_V1_fixed/db/relations.ts
- E:/smartspend_V1_fixed/db/schema.ts
- E:/smartspend_V1_fixed/api/lib/ai-usage-policy.ts
- E:/smartspend_V1_fixed/api/analytics-router.ts
- E:/smartspend_V1_fixed/api/notification-engine.ts

Tasks to execute:
1. In `db/relations.ts`:
   - Add relations export blocks for `discountCodesRelations`, `referralsRelations`, and `apiKeyErrorsRelations` (with both `localUser` and `oauthUser` relationships).
   - Add missing inverse `many(...)` relations to `usersRelations` and `localUsersRelations` for: `adClicks`, `aiMemoryEmbeddings`, `authChallenges`, `classificationLogs`, `discountCodes`, `apiKeyErrors`, `referralsMade` (from referrals where referrerId == users.id / localUsers.id), `referralsReceived` (from referrals where referredId == users.id / localUsers.id).
2. In `db/schema.ts`:
   - Remove the 8 redundant left-prefix duplicate secondary indexes identified in Explorer 2's audit:
     - `expenses_user_idx` on `expenses`
     - `users_referral_idx` on `users`
     - `webhook_tokens_token_idx` on `webhookTokens`
     - `user_dict_user_idx` on `userDictionaries`
     - `ai_summary_user_idx` on `aiSummaries`
     - `chat_msg_conv_idx` on `chatMessages`
     - `business_cat_idx` on `businessCategories`
     - `ai_memory_embedding_item_idx` on `aiMemoryEmbeddings`
3. In `api/lib/ai-usage-policy.ts:289`, `api/analytics-router.ts:146`, and `api/notification-engine.ts:641`:
   - Replace legacy `const today = new Date(); today.setHours(0, 0, 0, 0);` with `businessDayRange().start` imported from `api/lib/app-time.ts`.

Verification:
- Run tests on affected modules (`api/lib/app-time.test.ts`, etc.).
- Document commands and results in `E:/smartspend_V1_fixed/.agents/worker_1/handoff.md`.
- Send message back when complete.
