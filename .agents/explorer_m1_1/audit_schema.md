# SmartSpend AI — Milestone 1: Database Schema & Relational Integrity Audit Report

> **Auditor:** Explorer 1 (`explorer_m1_1`) — Database Schema & Relational Integrity  
> **Milestone:** Milestone 1 (Database Schema & Relational Integrity Audit)  
> **Date:** August 23, 2026  
> **Target Files Audited:** `db/schema.ts` (1,086 lines), `db/relations.ts` (405 lines)  
> **Referenced SSoT Specs:** `AGENTS.md`, `PROJECT.md`, `docs/02-DATABASE_SCHEMA.md`, `docs/05-AUTH_AND_SECURITY.md`, `.agents/spec_miner_survey_1/survey_specs.md`, `.agents/explorer_backend_1/survey_backend.md`

---

## 1. 🎯 Executive Summary & Scope

SmartSpend AI operates a dual-auth behavioral financial platform running on MySQL 8 with Drizzle ORM. The relational model accounts for both Google OAuth users (`users` table) and local phone/password/OTP users (`localUsers` table).

### Summary of Direct Observations:
1. **Total Tables:** Exactly **48 database tables** defined in `db/schema.ts` across 6 logical domain groups.
2. **Relational Coverage in `db/relations.ts`:**
   - 41 table relation definitions (`export const ...Relations = relations(...)`) are actively exported.
   - 4 tables are standalone/stateless by architectural design (`systemSettings`, `seoPages`, `onboardingQuestions`, `whatsappOtpCodes`).
   - **3 tables are imported at the top of `db/relations.ts` (lines 18, 22, 32) but have ZERO `relations()` exports:** `discountCodes`, `referrals`, and `apiKeyErrors`.
3. **Dual-User Polymorphic Pattern:**
   - 31 tables use the composite identity pair `userId: int("user_id")` and `userType: varchar("user_type", { length: 50 })` ("oauth" | "local").
   - `usersRelations` and `localUsersRelations` map 29 child tables with `many(...)` relations.
   - Omissions from `usersRelations` and `localUsersRelations`: `adClicks`, `aiMemoryEmbeddings`, `authChallenges`, `classificationLogs`, `referrals`, `discountCodes`, `ads`, `notificationTemplates`, and `apiKeyErrors`.
4. **Index Topology & Anti-Patterns:**
   - **8 Redundant/Duplicate Indexes** identified where a single-column index duplicates the left prefix of a composite or unique index.
   - **3 Missing Critical Indexes** identified: `sessions.expiresAt` (midnight cron batch purge), `monthlyReports.(userId, userType, month)` (missing unique constraint to prevent duplicate report insertions), and `referrals.(referredId, referredType)` (referral attribution query).
5. **Documentation vs Schema Discrepancies:**
   - 6 column naming/existence mismatches between `docs/02-DATABASE_SCHEMA.md` / `survey_specs.md` and the actual `db/schema.ts` code (e.g., `userContacts.relation` vs `relationship`, `userWallets.updatedAt` missing in schema, `proSubscriptions.endDate` vs `currentPeriodEnd`).

---

## 2. 🗄️ Comprehensive Table-by-Table Schema Audit (All 48 Tables)

### Group A: Identity & Sessions (6 Tables)

| # | Table Variable | SQL Table Name | Schema Line | Primary Key & Core Columns | Defined Indexes & Constraints | Audit Findings & Integrity Notes |
|---|---|---|---|---|---|---|
| 1 | `users` | `users` | `db/schema.ts:17` | `id` (int PK auto), `unionId` (varchar 255 unique), `name`, `email` (unique), `avatar`, `role` (def "user"), `plan` (def "free"), `referralCode` (unique), `referredBy` (int), `currentStreak`, `highestStreak`, `lastStreakAt`, `aiTokensUsed` | `users_role_idx` (`role`), `users_plan_idx` (`plan`), `users_referral_idx` (`referralCode`), `users_referred_by_idx` (`referredBy`) | Redundant index: `users_referral_idx` duplicates the unique constraint index on `referralCode`. Polymorphic FK risk: `referredBy` lacks `referredByType` (ambiguous link between OAuth and Local users). |
| 2 | `localUsers` | `local_users` | `db/schema.ts:48` | `id` (int PK auto), `name`, `phone` (unique), `password`, `email`, `avatar`, `role` (def "user"), `plan` (def "free"), `referralCode` (unique), `referredBy` (int), `currentStreak`, `highestStreak`, `lastStreakAt`, `aiTokensUsed` | `local_users_role_idx` (`role`), `local_users_plan_idx` (`plan`), `local_users_referred_by_idx` (`referredBy`) | Same polymorphic FK ambiguity on `referredBy`. Phone uniqueness enforced at DB level. |
| 3 | `sessions` | `sessions` | `db/schema.ts:282` | `id` (int PK auto), `userId` (notNull), `userType` (notNull), `token` (varchar 500), `ipAddress`, `userAgent`, `expiresAt` (datetime notNull), `createdAt` | `sessions_user_idx` (`userId, userType`), `sessions_token_idx` (`token`) | Missing index on `expiresAt`: daily midnight TTL cron performs full table scan on `sessions` to delete expired tokens. |
| 4 | `userCredentials` | `user_credentials` | `db/schema.ts:799` | `id` (varchar 255 PK - base64url credential ID), `userId`, `userType`, `publicKey` (text), `counter` (int def 0), `deviceType`, `backedUp`, `transports`, `lastUsedAt`, `createdAt` | `credentials_user_idx` (`userId, userType`) | String PK (credential ID). Full WebAuthn Level 3 compliance fields present. |
| 5 | `authChallenges` | `auth_challenges` | `db/schema.ts:821` | `id` (varchar 100 PK - session/uuid), `challenge` (varchar 255), `userId` (nullable), `userType` (nullable), `expiresAt` (datetime notNull) | `auth_challenges_user_idx` (`userId, userType`) | Ephemeral storage for passkey verification. `userId`/`userType` nullable to support sign-in challenge generation prior to user identification. |
| 6 | `webhookTokens` | `webhook_tokens` | `db/schema.ts:653` | `id` (int PK auto), `userId`, `userType`, `token` (varchar 255 unique), `name` (def "Default Token"), `createdAt` | `webhook_tokens_user_idx` (`userId, userType`), `webhook_tokens_token_idx` (`token`) | Redundant index: `webhook_tokens_token_idx` duplicates the unique constraint on `token`. |

---

### Group B: Financial Core Ledger (6 Tables)

| # | Table Variable | SQL Table Name | Schema Line | Primary Key & Core Columns | Defined Indexes & Constraints | Audit Findings & Integrity Notes |
|---|---|---|---|---|---|---|
| 7 | `expenses` | `expenses` | `db/schema.ts:79` | `id` (int PK auto), `userId`, `userType`, `type` (def "expense"), `amount` (decimal 12,2), `category`, `subCategory`, `description`, `rawText`, `source` (def "manual"), `paymentMethod`, `placeHint`, `parsedMetadata` (json), `contactId`, `classificationLogId`, `businessId`, `walletId`, `clientRequestId` (varchar 64), `date` (datetime), `status` (def "confirmed") | 11 Indexes: `expenses_user_idx` (`userId, userType`), `expenses_date_idx` (`date`), `expenses_user_date_idx` (`userId, userType, date`), `expenses_type_idx` (`type`), `expenses_category_idx` (`category`), `expenses_status_idx` (`status`), `expenses_business_idx` (`businessId`), `expenses_contact_idx` (`contactId`), `expenses_classification_log_idx` (`classificationLogId`), `expenses_wallet_idx` (`walletId`), `expenses_user_client_request_unique` unique index on (`userId, userType, clientRequestId`) | **Redundant Index:** `expenses_user_idx` is a left prefix of `expenses_user_date_idx`. **Idempotency Index:** `expenses_user_client_request_unique` correctly prevents network double-submit duplicates. **Indexed Wallet:** `expenses_wallet_idx` enables fast `eq(expenses.walletId, ...)` queries. |
| 8 | `expenseCategories` | `expense_categories` | `db/schema.ts:225` | `id` (int PK auto), `userId` (nullable), `userType` (nullable), `name`, `icon`, `color`, `isDefault` (boolean def false), `createdAt` | `categories_user_idx` (`userId, userType`) | `userId` is nullable to allow system-wide default categories (`isDefault: true`). |
| 9 | `userWallets` | `user_wallets` | `db/schema.ts:240` | `id` (int PK auto), `userId`, `userType`, `name`, `provider`, `lastFourDigits` (varchar 4), `balance` (decimal 12,2 def "0.00"), `createdAt` | `wallets_user_idx` (`userId, userType`) | **Missing Column:** `updatedAt` is documented in `survey_specs.md:98` but missing in `db/schema.ts:240-253`. |
| 10 | `financialGoals` | `financial_goals` | `db/schema.ts:670` | `id` (int PK auto), `userId`, `userType`, `title`, `description`, `targetAmount` (decimal 12,2), `targetDate`, `status` (def "active"), `aiPlan` (json), `aiAlerts` (json), `lastAnalyzedAt`, `createdAt`, `updatedAt` | `financial_goals_user_idx` (`userId, userType`), `financial_goals_status_idx` (`status`) | Linked to budgets via `userBudgets.linkedGoalId`. |
| 11 | `userBudgets` | `user_budgets` | `db/schema.ts:695` | `id` (int PK auto), `userId`, `userType`, `title`, `category`, `monthlyLimit` (decimal 12,2), `periodStartDay` (int def 1), `linkedGoalId` (int), `status` (def "active"), `alertThresholdPercent` (int def 80), `metadata` (json), `createdAt`, `updatedAt` | `user_budgets_user_idx` (`userId, userType, status`), `user_budgets_category_idx` (`category`), `user_budgets_goal_idx` (`linkedGoalId`) | `periodStartDay` supports Egyptian salary cycles (e.g. 25th of month). |
| 12 | `monthlyReports` | `monthly_reports` | `db/schema.ts:256` | `id` (int PK auto), `userId`, `userType`, `month` (varchar 7 - YYYY-MM), `totalAmount` (decimal 12,2), `totalIncome` (decimal 12,2 def "0.00"), `categoryBreakdown` (json), `topCategories` (json), `dailyAverage` (decimal 12,2), `highestDay` (varchar 10), `insights` (text), `aiReport` (text), `createdAt`, `updatedAt` | `reports_user_idx` (`userId, userType`), `reports_month_idx` (`month`) | **Missing Unique Constraint:** Lacks unique index on `(userId, userType, month)`. Duplicate monthly reports can be inserted if cron/job is re-triggered. |

---

### Group C: Freelance & Contact Relationships (4 Tables)

| # | Table Variable | SQL Table Name | Schema Line | Primary Key & Core Columns | Defined Indexes & Constraints | Audit Findings & Integrity Notes |
|---|---|---|---|---|---|---|
| 13 | `userBusinesses` | `user_businesses` | `db/schema.ts:129` | `id` (int PK auto), `userId`, `userType`, `name`, `type`, `typeLabel`, `description`, `keywords` (json), `isActive` (boolean def true), `createdAt`, `updatedAt` | `business_user_idx` (`userId, userType`), `business_active_idx` (`isActive`) | Multi-business ledger profiles for freelancers and small businesses. |
| 14 | `businessCategories` | `business_categories` | `db/schema.ts:153` | `id` (int PK auto), `businessId` (notNull), `name`, `nameAr`, `icon`, `color`, `type` (def "expense"), `keywords` (json), `matchExamples` (json), `isAutoGenerated` (def true), `isActive` (def true), `createdAt` | `business_cat_idx` (`businessId`), `business_cat_active_idx` (`businessId, isActive`) | **Redundant Index:** `business_cat_idx` (`businessId`) is a left prefix duplicate of `business_cat_active_idx` (`businessId, isActive`). |
| 15 | `userContacts` | `user_contacts` | `db/schema.ts:176` | `id` (int PK auto), `userId`, `userType`, `name`, `relation` (varchar 100), `aliases` (json), `contactType` (def "personal"), `businessId` (int), `isSilenced` (boolean def false), `transactionCount` (int def 0), `createdAt`, `updatedAt` | `contacts_user_idx` (`userId, userType`), `contacts_name_idx` (`name`), `contacts_type_idx` (`contactType`), `contacts_business_idx` (`businessId`), `contacts_silenced_idx` (`isSilenced`) | **Column Name Notice:** Column is named `relation` in code (`db/schema.ts:183`), but documented as `relationship` in specs/docs. Linked to `expenses.contactId`. |
| 16 | `pendingClarifications` | `pending_clarifications` | `db/schema.ts:204` | `id` (int PK auto), `userId`, `userType`, `expenseId` (int), `question` (text), `originalText` (text), `status` (def "pending"), `contextData` (json), `createdAt` | `clarifications_user_idx` (`userId, userType`), `clarifications_status_idx` (`status`), `clarifications_expense_idx` (`expenseId`) | Stores suspended classification states for user interactive clarification. |

---

### Group D: AI Layer & Behavioral Memory (12 Tables)

| # | Table Variable | SQL Table Name | Schema Line | Primary Key & Core Columns | Defined Indexes & Constraints | Audit Findings & Integrity Notes |
|---|---|---|---|---|---|---|
| 17 | `aiSummaries` | `ai_summaries` | `db/schema.ts:360` | `id` (int PK auto), `userId`, `userType`, `period` (monthly/yearly), `periodValue` (YYYY-MM), `model` (def "gemini-1.5-flash"), `content` (text), `createdAt` | `ai_summary_user_idx` (`userId, userType`), `ai_summary_period_idx` unique index on (`userId, userType, period, periodValue`) | **Redundant Index:** `ai_summary_user_idx` duplicates the left prefix of `ai_summary_period_idx`. |
| 18 | `aiConversationSummaries` | `ai_conversation_summaries` | `db/schema.ts:934` | `id` (int PK auto), `userId`, `userType`, `conversationId` (notNull), `capsule` (varchar 500), `runningSummary` (text), `messageCount` (int def 0), `source` (def "chat"), `createdAt`, `updatedAt` | `ai_conv_summary_unique_idx` unique index on (`conversationId`), `ai_conv_summary_user_idx` (`userId, userType`), `ai_conv_summary_updated_idx` (`updatedAt`) | Preserves chat context capsules while capping token budget. |
| 19 | `aiMemoryItems` | `ai_memory_items` | `db/schema.ts:957` | `id` (int PK auto), `userId`, `userType`, `memoryType` (def "fact"), `content` (text), `contentHash` (varchar 64), `importance` (def 50), `sourceConversationId`, `sourceMessageId`, `status` (def "active"), `metadata` (json), `createdAt`, `updatedAt` | `ai_memory_user_idx` (`userId, userType, status`), `ai_memory_hash_unique_idx` unique on (`userId, userType, contentHash`), `ai_memory_type_idx` (`memoryType`), `ai_memory_updated_idx` (`updatedAt`), `ai_memory_source_conv_idx` (`sourceConversationId`), `ai_memory_source_msg_idx` (`sourceMessageId`) | Deduplication enforced via `(userId, userType, contentHash)` unique index. |
| 20 | `aiMemoryEmbeddings` | `ai_memory_embeddings` | `db/schema.ts:986` | `id` (int PK auto), `memoryItemId` (notNull), `userId`, `userType`, `provider` (def "fireworks"), `model` (varchar 200), `dimensions` (int), `vectorHash` (varchar 64), `vector` (json), `createdAt` | `ai_memory_embedding_item_idx` (`memoryItemId`), `ai_memory_embedding_user_idx` (`userId, userType`), `ai_memory_embedding_unique_idx` unique on (`memoryItemId, provider, model, dimensions`) | **Redundant Index:** `ai_memory_embedding_item_idx` duplicates unique index left prefix. Vector is serialized as JSON float array for MySQL 8 compatibility. |
| 21 | `aiActionMemory` | `ai_action_memory` | `db/schema.ts:1012` | `id` (int PK auto), `userId`, `userType`, `actionName`, `status`, `summary`, `payload` (json), `sourceConversationId`, `createdAt`, `updatedAt` | `ai_action_memory_user_idx` (`userId, userType`), `ai_action_memory_action_idx` (`actionName, status`), `ai_action_memory_updated_idx` (`updatedAt`), `ai_action_memory_conv_idx` (`sourceConversationId`) | Long-term memory of autonomous actions performed for user. |
| 22 | `aiPendingActions` | `ai_pending_actions` | `db/schema.ts:1036` | `id` (int PK auto), `userId`, `userType`, `conversationId`, `actionName`, `status` (def "pending_confirmation"), `risk` (def "medium"), `summary`, `payload` (json), `result` (json), `expiresAt` (datetime notNull), `confirmedAt`, `executedAt`, `cancelledAt`, `idempotencyKey` (varchar 255), `createdAt`, `updatedAt` | `ai_pending_action_user_idx` (`userId, userType, status`), `ai_pending_action_expiry_idx` (`expiresAt`), `ai_pending_action_conversation_idx` (`conversationId`), `ai_pending_action_idempotency_idx` (`idempotencyKey`) | Action Runtime safety gate. Proposals require user approval before database mutation. |
| 23 | `aiActionAuditLogs` | `ai_action_audit_logs` | `db/schema.ts:1067` | `id` (int PK auto), `actionId`, `userId`, `userType`, `actionName`, `event`, `status`, `metadata` (json), `createdAt` | `ai_action_audit_action_idx` (`actionId`), `ai_action_audit_user_idx` (`userId, userType`), `ai_action_audit_event_idx` (`event`) | AI compliance and execution audit trail. |
| 24 | `classificationLogs` | `classification_logs` | `db/schema.ts:602` | `id` (int PK auto), `userId`, `userType`, `originalText`, `normalizedText`, `parsedBy`, `ruleEngineResult` (json), `aiResult` (json), `finalResult` (json), `confidence` (def 0), `decision`, `classificationVersion` (def "v2.1"), `reasoningTraceLight` (json), `ambiguityFlags` (json), `inputChannel` (def "text"), `needsFollowup` (def false), `wasCorrected` (def false), `correction` (json), `modelUsed`, `tokensUsed` (def 0), `processingTimeMs` (def 0), `createdAt` | `cls_log_user_idx` (`userId, userType`), `cls_log_parsed_idx` (`parsedBy`), `cls_log_date_idx` (`createdAt`) | 5-layer classification trace log linked to `expenses.classificationLogId`. |
| 25 | `onboardingQuestions` | `onboarding_questions` | `db/schema.ts:572` | `id` (int PK auto), `questionText` (varchar 500), `questionKey` (varchar 100 unique), `inputType` (def "text"), `options` (json), `isActive` (def true), `sortOrder` (def 0), `createdAt` | Unique constraint on `questionKey` | System admin question catalog (stateless). |
| 26 | `userDictionaries` | `user_dictionaries` | `db/schema.ts:584` | `id` (int PK auto), `userId`, `userType`, `word` (varchar 100), `category`, `subCategory`, `createdAt` | `user_dict_user_idx` (`userId, userType`), `user_dict_word_unique` unique index on (`userId, userType, word`) | **Redundant Index:** `user_dict_user_idx` duplicates unique index left prefix. Layer 1 muscle memory vocabulary store. |
| 27 | `profileLearningEvents` | `profile_learning_events` | `db/schema.ts:516` | `id` (int PK auto), `userId`, `userType`, `eventType`, `source` (def "backend"), `previousAttributes` (json), `newAttributes` (json), `metadata` (json), `createdAt` | `profile_learning_user_idx` (`userId, userType`), `profile_learning_event_idx` (`eventType`) | Logs profile evolution events when user corrects classifications. |
| 28 | `monthlyBehaviorSnapshots` | `monthly_behavior_snapshots` | `db/schema.ts:536` | `id` (int PK auto), `userId`, `userType`, `month` (varchar 7), `totalIncome` (decimal 12,2 def 0.00), `totalExpense` (decimal 12,2 def 0.00), `netFlow` (decimal 12,2 def 0.00), `topCategories` (json), `topSubCategories` (json), `spendingByDay` (json), `spendingByWeekday` (json), `behaviorFlags` (json), `inferredAttributes` (json), `createdAt`, `updatedAt` | `behavior_snapshot_user_month_idx` unique on (`userId, userType, month`), `behavior_snapshot_month_idx` (`month`) | Longitudinal financial behavior vector store. |

---

### Group E: Conversational AI & Communications (5 Tables)

| # | Table Variable | SQL Table Name | Schema Line | Primary Key & Core Columns | Defined Indexes & Constraints | Audit Findings & Integrity Notes |
|---|---|---|---|---|---|---|
| 29 | `chatConversations` | `chat_conversations` | `db/schema.ts:894` | `id` (int PK auto), `userId`, `userType`, `title`, `messageCount` (def 0), `totalTokens` (def 0), `lastMessageAt`, `metadata` (json), `createdAt` | `chat_conv_user_idx` (`userId, userType`), `chat_conv_last_msg_idx` (`lastMessageAt`) | Chat session container. |
| 30 | `chatMessages` | `chat_messages` | `db/schema.ts:914` | `id` (int PK auto), `conversationId` (notNull), `role` (varchar 20), `content` (text), `toolCalls` (json), `toolResults` (json), `tokensUsed` (def 0), `model`, `createdAt` | `chat_msg_conv_idx` (`conversationId`), `chat_msg_created_idx` (`conversationId, createdAt`) | **Redundant Index:** `chat_msg_conv_idx` duplicates the left prefix of `chat_msg_created_idx`. |
| 31 | `rawSmsEvents` | `raw_sms_events` | `db/schema.ts:722` | `id` (int PK auto), `userId`, `userType`, `message` (text), `sender` (varchar 100), `smsTimestamp`, `status` (def "pending"), `metadata` (json), `createdAt` | `raw_sms_user_idx` (`userId, userType`), `raw_sms_status_idx` (`status`) | Ingested SMS logs. **Note:** `parsedExpenseId` documented in `survey_specs.md:135` is absent; expense ID is stored inside `metadata` JSON. |
| 32 | `whatsappOtpCodes` | `whatsapp_otp_codes` | `db/schema.ts:742` | `id` (int PK auto), `phone` (varchar 20), `code` (varchar 20), `verified` (boolean def false), `expiresAt` (datetime), `createdAt` (timestamp defaultNow) | `whatsapp_otp_phone_idx` (`phone`) | Zero-polling SSE OTP pairing table. Uses `timestamp` for `createdAt`. |
| 33 | `voiceUsage` | `voice_usage` | `db/schema.ts:638` | `id` (int PK auto), `userId`, `userType`, `durationSeconds` (int), `month` (varchar 7), `source` (def "gemini_stt"), `createdAt` | `voice_user_month_idx` (`userId, userType, month`) | Monthly voice call & STT usage tracking per user. |

---

### Group F: System Operations & Notifications (15 Tables)

| # | Table Variable | SQL Table Name | Schema Line | Primary Key & Core Columns | Defined Indexes & Constraints | Audit Findings & Integrity Notes |
|---|---|---|---|---|---|---|
| 34 | `systemSettings` | `system_settings` | `db/schema.ts:480` | `key` (varchar 100 PK), `value` (text), `updatedAt` (timestamp defaultNow onUpdateNow) | Primary Key on `key` | Global dynamic system configuration. Cached in RAM with 5-min TTL. |
| 35 | `userProfiles` | `user_profiles` | `db/schema.ts:487` | `id` (int PK auto), `userId`, `userType`, `monthlyIncome` (decimal 12,2), `financialGoal`, `financialPersonality`, `basicInfo` (json), `financialInfo` (json), `lifestyleInfo` (json), `onboardingAnswers` (json), `aiInferredAttributes` (json), `preferences` (json), `avatarId`, `profileVersion` (def 2), `lastAiRefreshAt`, `profileCompleted` (def false), `lastAskedAt`, `createdAt`, `updatedAt` | `profile_user_idx` unique index on (`userId, userType`) | 1:1 financial context profile per user. |
| 36 | `userAnalytics` | `user_analytics` | `db/schema.ts:301` | `id` (int PK auto), `userId`, `userType`, `event` (varchar 100), `metadata` (json), `createdAt` | `analytics_user_idx` (`userId, userType`), `analytics_event_idx` (`event`) | **Column Naming Notice:** Columns are `event` and `metadata` (documented as `eventName`/`eventData` in `survey_specs.md:145`). |
| 37 | `supportTickets` | `support_tickets` | `db/schema.ts:318` | `id` (int PK auto), `userId`, `userType`, `subject`, `message` (text), `status` (def "open"), `priority` (def "medium"), `assignedTo` (int), `response` (text), `respondedAt`, `createdAt`, `updatedAt` | `tickets_user_idx` (`userId, userType`), `tickets_status_idx` (`status`), `tickets_assigned_idx` (`assignedTo`) | User support requests. `assignedTo` links to admin/moderator user ID. |
| 38 | `discountCodes` | `discount_codes` | `db/schema.ts:344` | `id` (int PK auto), `code` (varchar 100 unique), `type` (def "referral"), `discountPercent` (int def 0), `maxUses`, `usedCount` (def 0), `createdBy` (int), `expiresAt`, `createdAt` | `discount_codes_creator_idx` (`createdBy`) | Unique constraint on `code`. Missing relations definition in `db/relations.ts`. |
| 39 | `ads` | `ads` | `db/schema.ts:384` | `id` (int PK auto), `title`, `content` (text), `imageUrl`, `linkUrl`, `placement` (def "sidebar"), `targetPlan` (def "free"), `startDate`, `endDate`, `clicks` (def 0), `impressions` (def 0), `isActive` (def true), `createdBy` (int), `createdAt` | `ads_creator_idx` (`createdBy`), `ads_active_idx` (`isActive`) | In-app sponsorship cards. |
| 40 | `adClicks` | `ad_clicks` | `db/schema.ts:406` | `id` (int PK auto), `adId` (notNull), `userId` (nullable), `userType` (nullable), `ipAddress`, `createdAt` | `ad_clicks_ad_idx` (`adId`), `ad_clicks_user_idx` (`userId, userType`) | Ad click tracking. `userId` nullable for unauthenticated visitors. |
| 41 | `referrals` | `referrals` | `db/schema.ts:420` | `id` (int PK auto), `referrerId` (notNull), `referrerType` (notNull), `referredId` (notNull), `referredType` (notNull), `codeUsed`, `status` (def "pending"), `rewardGiven` (def false), `createdAt` | `referral_unique_idx` unique index on (`referrerId, referrerType, referredId, referredType`) | Missing relation definition in `db/relations.ts`. Missing index on `(referredId, referredType)`. |
| 42 | `proSubscriptions` | `pro_subscriptions` | `db/schema.ts:444` | `id` (int PK auto), `userId`, `userType`, `plan` (def "pro_monthly"), `status` (def "active"), `autoRenew` (def true), `startDate`, `endDate`, `paymentMethod`, `transactionId`, `createdAt`, `updatedAt` | `pro_sub_user_idx` (`userId, userType`) | **Column Naming Notice:** Column is `endDate` in schema (documented as `currentPeriodEnd` in specs). |
| 43 | `seoPages` | `seo_pages` | `db/schema.ts:466` | `id` (int PK auto), `path` (varchar 255 unique), `title`, `description` (text), `keywords` (text), `ogImage`, `canonicalUrl`, `updatedAt` | Unique constraint on `path` | Dynamic landing pages. Column is `path` (documented as `slug` in specs). |
| 44 | `apiKeyErrors` | `api_key_errors` | `db/schema.ts:758` | `id` (int PK auto), `provider`, `keyLabel`, `errorType`, `message` (text), `httpStatus`, `userId` (nullable), `resolved` (def false), `resolvedAt`, `createdAt` | `api_key_errors_provider_idx` (`provider`), `api_key_errors_type_idx` (`errorType`), `api_key_errors_resolved_idx` (`resolved`), `api_key_errors_date_idx` (`createdAt`), `api_key_errors_user_idx` (`userId`) | Admin AI key error logger. Missing relation definition in `db/relations.ts`. |
| 45 | `pushSubscriptions` | `push_subscriptions` | `db/schema.ts:782` | `id` (int PK auto), `userId`, `userType`, `endpoint` (text), `p256dh`, `auth`, `fcmToken` (text), `deviceType` (def "web"), `createdAt` | `push_subs_user_idx` (`userId, userType`) | WebPush & FCM push subscription tokens. |
| 46 | `notificationTemplates` | `notification_templates` | `db/schema.ts:833` | `id` (int PK auto), `name`, `eventType`, `titleTemplate`, `bodyTemplate`, `titleTemplateAr`, `bodyTemplateAr`, `titleTemplateEn`, `bodyTemplateEn`, `isActive` (def true), `targetSegment` (json), `sendAt`, `createdBy` (int), `createdAt`, `updatedAt` | `notif_templates_creator_idx` (`createdBy`), `notif_templates_event_idx` (`eventType`) | Multilingual notification templates. |
| 47 | `inAppNotifications` | `in_app_notifications` | `db/schema.ts:856` | `id` (int PK auto), `userId`, `userType`, `title`, `body` (text), `actionUrl`, `isRead` (def false), `createdAt` | `in_app_notif_user_idx` (`userId, userType`), `in_app_notif_read_idx` (`isRead`) | User in-app notification alerts. |
| 48 | `notificationLogs` | `notification_logs` | `db/schema.ts:875` | `id` (int PK auto), `templateId` (int), `userId` (nullable), `userType` (nullable), `sentVia`, `status` (def "sent"), `errorMessage` (text), `sentAt` (def CURRENT_TIMESTAMP) | `notif_logs_user_idx` (`userId, userType`), `notif_logs_template_idx` (`templateId`) | Multi-channel delivery audit logs. |

---

## 3. 🔗 Relational Coverage & Dual-User Integrity Audit (`db/relations.ts`)

### A. Dual-User Mapping Coverage
SmartSpend handles both OAuth and Local users. When relational queries run via Drizzle (`db.query.expenses.findMany({ with: { localUser: true, oauthUser: true } })`), both relations must be defined.

| Relational Entity | `localUser` Relation | `oauthUser` Relation | Inverse on `usersRelations` | Inverse on `localUsersRelations` | Relational Health Status |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `expenses` | ✅ line 118 | ✅ line 122 | ✅ line 50 | ✅ line 84 | **100% COMPLETE** |
| `expenseCategories` | ✅ line 146 | ✅ line 150 | ✅ line 51 | ✅ line 85 | **100% COMPLETE** |
| `sessions` | ✅ line 157 | ✅ line 161 | ✅ line 52 | ✅ line 86 | **100% COMPLETE** |
| `userWallets` | ✅ line 168 | ✅ line 172 | ✅ line 53 | ✅ line 87 | **100% COMPLETE** |
| `financialGoals` | ✅ line 180 | ✅ line 184 | ✅ line 54 | ✅ line 88 | **100% COMPLETE** |
| `userContacts` | ✅ line 192 | ✅ line 196 | ✅ line 55 | ✅ line 89 | **100% COMPLETE** |
| `userBusinesses` | ✅ line 220 | ✅ line 224 | ✅ line 56 | ✅ line 90 | **100% COMPLETE** |
| `pendingClarifications` | ✅ line 241 | ✅ line 242 | ✅ line 79 | ✅ line 113 | **100% COMPLETE** |
| `monthlyReports` | ✅ line 247 | ✅ line 248 | ✅ line 71 | ✅ line 105 | **100% COMPLETE** |
| `userAnalytics` | ✅ line 252 | ✅ line 253 | ✅ line 69 | ✅ line 103 | **100% COMPLETE** |
| `supportTickets` | ✅ line 257 | ✅ line 258 | ✅ line 70 | ✅ line 104 | **100% COMPLETE** |
| `aiSummaries` | ✅ line 262 | ✅ line 263 | ✅ line 72 | ✅ line 106 | **100% COMPLETE** |
| `adClicks` | ✅ line 271 | ✅ line 272 | ❌ **Missing** | ❌ **Missing** | **Partial** (adClicks defined, inverse missing on users) |
| `proSubscriptions` | ✅ line 277 | ✅ line 278 | ✅ line 61 | ✅ line 95 | **100% COMPLETE** |
| `userProfiles` | ✅ line 282 | ✅ line 283 | ✅ line 60 | ✅ line 94 | **100% COMPLETE** (1:1 mapped as many) |
| `profileLearningEvents` | ✅ line 287 | ✅ line 288 | ✅ line 73 | ✅ line 107 | **100% COMPLETE** |
| `monthlyBehaviorSnapshots` | ✅ line 292 | ✅ line 293 | ✅ line 74 | ✅ line 108 | **100% COMPLETE** |
| `userDictionaries` | ✅ line 297 | ✅ line 298 | ✅ line 66 | ✅ line 100 | **100% COMPLETE** |
| `voiceUsage` | ✅ line 302 | ✅ line 303 | ✅ line 67 | ✅ line 101 | **100% COMPLETE** |
| `webhookTokens` | ✅ line 307 | ✅ line 308 | ✅ line 65 | ✅ line 99 | **100% COMPLETE** |
| `userBudgets` | ✅ line 312 | ✅ line 313 | ✅ line 62 | ✅ line 96 | **100% COMPLETE** |
| `rawSmsEvents` | ✅ line 318 | ✅ line 319 | ✅ line 68 | ✅ line 102 | **100% COMPLETE** |
| `pushSubscriptions` | ✅ line 323 | ✅ line 324 | ✅ line 64 | ✅ line 98 | **100% COMPLETE** |
| `userCredentials` | ✅ line 328 | ✅ line 329 | ✅ line 63 | ✅ line 97 | **100% COMPLETE** |
| `authChallenges` | ✅ line 333 | ✅ line 334 | ❌ **Missing** | ❌ **Missing** | **Partial** (authChallenges defined, inverse missing on users) |
| `inAppNotifications` | ✅ line 342 | ✅ line 343 | ✅ line 58 | ✅ line 92 | **100% COMPLETE** |
| `notificationLogs` | ✅ line 347 | ✅ line 348 | ✅ line 80 | ✅ line 114 | **100% COMPLETE** |
| `chatConversations` | ✅ line 353 | ✅ line 354 | ✅ line 57 | ✅ line 91 | **100% COMPLETE** |
| `aiConversationSummaries` | ✅ line 368 | ✅ line 369 | ✅ line 75 | ✅ line 109 | **100% COMPLETE** |
| `aiMemoryItems` | ✅ line 374 | ✅ line 375 | ✅ line 59 | ✅ line 93 | **100% COMPLETE** |
| `aiMemoryEmbeddings` | ✅ line 382 | ✅ line 383 | ❌ **Missing** | ❌ **Missing** | **Partial** (embeddings defined, inverse missing on users) |
| `aiActionMemory` | ✅ line 388 | ✅ line 389 | ✅ line 76 | ✅ line 110 | **100% COMPLETE** |
| `aiPendingActions` | ✅ line 394 | ✅ line 395 | ✅ line 77 | ✅ line 111 | **100% COMPLETE** |
| `aiActionAuditLogs` | ✅ line 401 | ✅ line 402 | ✅ line 78 | ✅ line 112 | **100% COMPLETE** |
| `classificationLogs` | ✅ line 208 | ✅ line 212 | ❌ **Missing** | ❌ **Missing** | **Partial** (logs defined, inverse missing on users) |

---

### B. Identified Missing Relation Definitions in `db/relations.ts`

1. **`discountCodes` (`db/relations.ts:18`):**
   - Imported on line 18, but NO `discountCodesRelations` is defined.
   - Column `createdBy: int("created_by")` lacks relation mapping to `users` / `localUsers`.
2. **`referrals` (`db/relations.ts:22`):**
   - Imported on line 22, but NO `referralsRelations` is defined.
   - Columns `referrerId`, `referrerType`, `referredId`, `referredType` have no relational exports.
3. **`apiKeyErrors` (`db/relations.ts:32`):**
   - Imported on line 32, but NO `apiKeyErrorsRelations` is defined.
   - Column `userId: int("user_id")` has no relation mapping.
4. **`supportTickets.assignedTo` (`db/relations.ts:256-259`):**
   - `supportTicketsRelations` defines `localUser` and `oauthUser` for the ticket owner, but lacks `assignedStaff` relation mapping for `assignedTo`.
5. **`ads.createdBy` & `notificationTemplates.createdBy` (`db/relations.ts:266, 337`):**
   - Creator foreign keys have no relation definitions linking to administrative users.

---

## 4. ⚡ Index Topology, Redundancies & Anti-Pattern Analysis

MySQL InnoDB organizes tables as clustered indexes on Primary Key. Secondary indexes store the indexed columns plus the PK.

### A. Redundant & Duplicate Indexes (Write Amplification & RAM Waste)

| Table | Redundant Index Name | Indexed Columns | Overlapping / Containing Index | Why It Is Redundant & Recommendation |
|---|---|---|---|---|
| `expenses` | `expenses_user_idx` (`db/schema.ts:110`) | `(userId, userType)` | `expenses_user_date_idx` on `(userId, userType, date)` | B-Tree index lookup on `(userId, userType)` is fully satisfied by the left prefix of `expenses_user_date_idx`. Drop `expenses_user_idx` to save write I/O on every transaction insert. |
| `users` | `users_referral_idx` (`db/schema.ts:42`) | `(referralCode)` | `referralCode` `.unique()` constraint | MySQL automatically creates an internal unique index for `.unique()`. `users_referral_idx` creates an identical duplicate secondary index. Drop `users_referral_idx`. |
| `webhookTokens` | `webhook_tokens_token_idx` (`db/schema.ts:665`) | `(token)` | `token` `.unique()` constraint | Duplicate secondary index over already uniquely indexed column. Drop `webhook_tokens_token_idx`. |
| `userDictionaries` | `user_dict_user_idx` (`db/schema.ts:596`) | `(userId, userType)` | `user_dict_word_unique` on `(userId, userType, word)` | Satisfied by the left prefix of `user_dict_word_unique`. Drop `user_dict_user_idx`. |
| `aiSummaries` | `ai_summary_user_idx` (`db/schema.ts:373`) | `(userId, userType)` | `ai_summary_period_idx` on `(userId, userType, period, periodValue)` | Satisfied by the left prefix of `ai_summary_period_idx`. Drop `ai_summary_user_idx`. |
| `chatMessages` | `chat_msg_conv_idx` (`db/schema.ts:928`) | `(conversationId)` | `chat_msg_created_idx` on `(conversationId, createdAt)` | Satisfied by the left prefix of `chat_msg_created_idx`. Drop `chat_msg_conv_idx`. |
| `businessCategories` | `business_cat_idx` (`db/schema.ts:170`) | `(businessId)` | `business_cat_active_idx` on `(businessId, isActive)` | Satisfied by the left prefix of `business_cat_active_idx`. Drop `business_cat_idx`. |
| `aiMemoryEmbeddings` | `ai_memory_embedding_item_idx` (`db/schema.ts:1001`) | `(memoryItemId)` | `ai_memory_embedding_unique_idx` on `(memoryItemId, provider, model, dimensions)` | Satisfied by the left prefix of `ai_memory_embedding_unique_idx`. Drop `ai_memory_embedding_item_idx`. |

---

### B. Missing Critical Indexes

| Table | Target Query / Use Case | Missing Index Specification | Severity | Impact If Omitted |
|---|---|---|---|---|
| `sessions` | Daily midnight cron cleanup (`api/boot.ts:47`): `DELETE FROM sessions WHERE expires_at < NOW()` | `index("sessions_expires_idx").on(t.expiresAt)` | Medium | Full table scan of active/expired session tokens every night. |
| `monthlyReports` | Monthly report compilation & idempotency check | `uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month)` | High | Without unique constraint on `(userId, userType, month)`, retried monthly jobs insert duplicate report records. |
| `referrals` | Reverse lookup: checking if a newly registered user was already referred | `index("referral_referred_idx").on(t.referredId, t.referredType)` | Medium | Queries filtering by `(referredId, referredType)` must scan all referral rows. |
| `userAnalytics` | Analytical time-range queries (e.g. daily/weekly event counts) | `index("analytics_date_idx").on(t.createdAt)` | Low | Table scans when generating admin telemetry reports across date ranges. |

---

### C. Low-Cardinality Standalone Index Anti-Patterns

| Table | Index Name | Column | Why It Is An Anti-Pattern | Recommendation |
|---|---|---|---|---|
| `expenses` | `expenses_type_idx` (`db/schema.ts:113`) | `type` (4 distinct values) | MySQL optimizer skips standalone index on 4-value column during table scan unless user is filtered. | Combine into composite `(userId, userType, type)` or drop standalone. |
| `expenses` | `expenses_status_idx` (`db/schema.ts:115`) | `status` (2 distinct values) | Extremely low cardinality. | Drop standalone index. Status queries are covered when combined with user filter. |
| `financialGoals`| `financial_goals_status_idx` (`db/schema.ts:691`) | `status` | Low cardinality without user context. | Replace with composite index `(userId, userType, status)`. |

---

## 5. 🔍 Data Types, Precision, Nullability & Vector Storage

### A. Decimal Precision Standard
- Financial values throughout SmartSpend AI use `decimal(..., { precision: 12, scale: 2 })`:
  - `expenses.amount` (line 86)
  - `userWallets.balance` (line 249)
  - `financialGoals.targetAmount` (line 678)
  - `userBudgets.monthlyLimit` (line 703)
  - `monthlyReports.totalAmount`, `totalIncome`, `dailyAverage` (lines 261-267)
  - `monthlyBehaviorSnapshots.totalIncome`, `totalExpense`, `netFlow` (lines 543-549)
  - `userProfiles.monthlyIncome` (line 493)
- **Evaluation:** Strict adherence to financial precision standards. No JavaScript floating-point rounding errors (`0.1 + 0.2 = 0.30000000000000004`) in persistent storage. Max representable amount is `9,999,999,999.99` EGP, aligning with `ExpenseInputLimits.amountMax` (`contracts/constants.ts`).

### B. Vector Embeddings Storage Strategy (`aiMemoryEmbeddings`)
- Column: `vector: json("vector")` (`db/schema.ts:997`)
- Model: Fireworks `qwen3-embedding-8b` / `text-embedding-3-small` (768-dim float array).
- **Architectural Tradeoff:** Because standard MySQL 8 does not include the pgvector extension, vector similarity search operates in Node.js runtime memory (`api/lib/embedding-engine.ts`) after partitioning embeddings by user `(userId, userType)`. Given individual user memory facts are bounded (<500 items per user), in-memory cosine calculation executes in `<15ms` with zero vector database operational overhead.

### C. Date vs. Timestamp Inconsistency
- 46 tables use `datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)`.
- 2 tables use `timestamp("created_at").defaultNow()`:
  - `whatsappOtpCodes.createdAt` (`db/schema.ts:750`)
  - `systemSettings.updatedAt` (`db/schema.ts:483`)
- **Evaluation:** `datetime` stores timezone-agnostic representations (recommended for financial ledgers), while `timestamp` converts to UTC internally with a 2038 year limit. Standardization to `datetime` across all 48 tables is recommended for uniform Drizzle ORM mapping.

---

## 6. 🚨 Living Documentation vs Codebase Discrepancy Matrix

| Entity / Table | Documented in `docs/` or `survey_specs.md` | Actual in `db/schema.ts` Code | Discrepancy Severity | Impact & Recommendation |
|---|---|---|---|---|
| `userContacts` | Column documented as `relationship` (`survey_specs.md:109`) | Column is named `relation: varchar("relation", { length: 100 })` (`schema.ts:183`) | Low (Doc mismatch) | Update documentation to reflect `relation`. |
| `userWallets` | Column `updatedAt` documented in `survey_specs.md:98` | Missing in `schema.ts:240-253` | Medium (Feature gap) | Add `updatedAt: datetime("updated_at").default(...)` to `userWallets`. |
| `userAnalytics` | Columns documented as `eventName`, `eventData` (`survey_specs.md:145`) | Columns are `event: varchar(...)`, `metadata: json(...)` (`schema.ts:307-308`) | Low (Doc mismatch) | Update documentation to reflect `event` and `metadata`. |
| `seoPages` | Columns documented as `slug`, `metaDescription` (`survey_specs.md:152`) | Columns are `path: varchar(...)`, `description: text(...)` (`schema.ts:468-470`) | Low (Doc mismatch) | Update documentation to reflect `path` and `description`. |
| `proSubscriptions` | Column documented as `currentPeriodEnd` (`survey_specs.md:151`) | Column is `endDate: datetime(...)` (`schema.ts:454`) | Low (Doc mismatch) | Update documentation to reflect `endDate`. |
| `rawSmsEvents` | Column `parsedExpenseId` documented (`survey_specs.md:135`) | Missing as column; parsed data is stored in `metadata: json(...)` (`schema.ts:732`) | Low (Doc mismatch) | Clarify in documentation that SMS expense linkage is JSON-metadata based. |
| `ads` | Composite index `(createdBy, isActive)` documented (`survey_specs.md:148`) | Two separate single indexes: `ads_creator_idx` and `ads_active_idx` (`schema.ts:400-403`) | Low (Performance) | Consolidate into composite index `(createdBy, isActive)`. |

---

## 7. 🛡️ Relational Integrity, Cascade Deletions & Polymorphic FK Risks

### A. Polymorphic User Links (`referredBy`)
- Tables `users` (`schema.ts:28`) and `localUsers` (`schema.ts:60`) define `referredBy: int("referred_by")`.
- **Integrity Vulnerability (`FLAW-BE-25`):** There is no corresponding `referredByType` ("oauth" | "local"). If User ID 5 in `localUsers` has `referredBy = 3`, the application cannot determine whether referrer is OAuth User 3 or Local User 3 without inspecting referral codes.
- **Resolution:** In contrast, the dedicated `referrals` ledger table (`schema.ts:420`) correctly implements full tuple identity: `(referrerId, referrerType, referredId, referredType)`. The legacy single column `referredBy` should be deprecated in favor of relational queries against `referrals`.

### B. Application-Level Cascade Purge Safety Gate
SmartSpend utilizes MySQL without database-level `ON DELETE CASCADE` foreign keys due to dual-user polymorphic tables. Therefore, application services must guarantee complete transactional purge across all user-owned tables:
- **Critical Finding (`FLAW-BE-04`, `FLAW-BE-05`):** Existing `deleteUser` implementations in `localAuthRouter` (`api/local-auth-router.ts:348`) and `adminRouter` (`api/admin-router.ts:360`) only delete from 19 of 35 user-scoped tables, leaving orphaned rows in WebAuthn credentials, push subscriptions, chat history, memory embeddings, businesses, contacts, budgets, and goals.
- **Remediation Specification:** Implement a single centralized `purgeUserData(userId: number, userType: "oauth" | "local", tx: Transaction)` function in `api/services/user-lifecycle-service.ts` that purges all 35 user-scoped tables atomically.

---

## 8. 📋 Prioritized Action & Remediation Roadmap

```
                                  REMEDIATION ROADMAP
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │ PRIORITY 1: Relational Completeness (db/relations.ts)                            │
 │ • Export discountCodesRelations, referralsRelations, apiKeyErrorsRelations.      │
 │ • Add inverse many() relations on usersRelations and localUsersRelations for     │
 │   adClicks, aiMemoryEmbeddings, authChallenges, classificationLogs.              │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ PRIORITY 2: Data Integrity & Idempotency Constraints (db/schema.ts)              │
 │ • Add uniqueIndex("reports_user_month_unique") to monthlyReports.                │
 │ • Add index("sessions_expires_idx") to sessions for TTL midnight cron.          │
 │ • Add index("referral_referred_idx") to referrals.                               │
 │ • Add missing updatedAt column to userWallets table.                             │
 ├──────────────────────────────────────────────────────────────────────────────────┤
 │ PRIORITY 3: Index Pruning & Write Optimization (db/schema.ts)                    │
 │ • Drop 8 redundant left-prefix duplicate indexes (expenses_user_idx,             │
 │   users_referral_idx, webhook_tokens_token_idx, user_dict_user_idx,              │
 │   ai_summary_user_idx, chat_msg_conv_idx, business_cat_idx,                      │
 │   ai_memory_embedding_item_idx).                                                 │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

---
*Report generated for SmartSpend AI Milestone 1 Relational Audit.*
