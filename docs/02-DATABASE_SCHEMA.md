# SmartSpend AI — Database Schema Reference (All 48 Tables)

> **AI AGENT SSOT:** This document defines the MySQL database groups, 100% Drizzle ORM relationships (`db/relations.ts`), index optimizations, and schema-specific development gotchas.

---

## 1. 🗄️ Database Logical Groups (48 Tables)

### Group A: Identity, Sessions & Passkeys (6 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `users` | `users` | `id`, `name`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `currentStreak`, `highestStreak`, `lastStreakAt`. <br> *Indexes:* `role`, `plan`, `referralCode`, `referredBy`. |
| `localUsers` | `local_users` | `id`, `name`, `phone`, `password`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `aiTokensUsed`, `currentStreak`, `highestStreak`, `lastStreakAt`. <br> *Indexes:* `role`, `plan`, `referredBy`. |
| `sessions` | `sessions` | `id`, `token`, `userId`, `userType`, `expiresAt`, `ipAddress`, `userAgent`. <br> *Indexes:* `(userId, userType)`, `token`, `expiresAt` (`sessions_expires_idx`). |
| `userCredentials`| `user_credentials` | WebAuthn Level 3 biometric credentials (`id`, `userId`, `userType`, `publicKey`, `counter`, `deviceType`, `backedUp`, `transports`, `lastUsedAt`). <br> *Indexes:* `(userId, userType)`. |
| `authChallenges` | `auth_challenges` | Ephemeral WebAuthn challenge store (`id`, `challenge`, `userId`, `userType`, `expiresAt`). <br> *Indexes:* `(userId, userType)`. |
| `webhookTokens` | `webhook_tokens` | Secure authentication tokens for Android & iOS companion apps (`token`, `userId`, `userType`, `name`). <br> *Indexes:* `(userId, userType)`, `token`. |

---

### Group B: Financial Core Ledger (6 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `expenses` | `expenses` | `id`, `userId`, `userType`, `type`, `amount`, `category`, `subCategory`, `description`, `rawText`, `source`, `placeHint`, `parsedMetadata`, `contactId`, `classificationLogId`, `businessId`, `walletId`, `clientRequestId`, `date`, `status`. <br> *Indexes:* `date`, `(userId, userType, date)`, `type`, `category`, `status`, `businessId`, `contactId`, `classificationLogId`, `walletId` (`expenses_wallet_idx`), unique `(userId, userType, clientRequestId)` (`expenses_user_client_request_unique`). |
| `expenseCategories`| `expense_categories` | User-defined and system categories (`id`, `userId`, `userType`, `name`, `icon`, `color`, `isDefault`). <br> *Indexes:* `(userId, userType)`. |
| `userWallets` | `user_wallets` | Financial accounts (`id`, `userId`, `userType`, `name`, `provider`, `lastFourDigits`, `balance`). <br> *Indexes:* `(userId, userType)`. |
| `financialGoals` | `financial_goals` | Savings and debt goals (`id`, `userId`, `userType`, `title`, `targetAmount`, `targetDate`, `status`, `aiPlan`, `aiAlerts`). <br> *Indexes:* `(userId, userType)`, `status`. |
| `userBudgets` | `user_budgets` | Monthly budget limits (`id`, `userId`, `userType`, `title`, `category`, `monthlyLimit`, `linkedGoalId`, `periodStartDay`, `status`, `alertThresholdPercent`). <br> *Indexes:* `(userId, userType, status)`, `category`, `linkedGoalId`. |
| `monthlyReports` | `monthly_reports` | Materialized monthly spending summaries (`id`, `userId`, `userType`, `month`, `totalAmount`, `totalIncome`, `categoryBreakdown`, `insights`, `aiReport`). <br> *Indexes:* `reports_month_idx` on `month`, unique `reports_user_month_unique` on `(userId, userType, month)`. *(Note: redundant `reports_user_idx` successfully dropped).* |

---

### Group C: Freelance & Contacts (4 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `userBusinesses` | `user_businesses` | Freelancer and business mode profiles (`id`, `userId`, `userType`, `name`, `type`, `isActive`). <br> *Indexes:* `(userId, userType)`, `isActive`. |
| `businessCategories`| `business_categories`| Tax deduction codes & business classifications (`businessId`, `name`, `nameAr`, `type`, `keywords`, `isActive`). <br> *Indexes:* `business_cat_active_idx` on `(businessId, isActive)`. |
| `userContacts` | `user_contacts` | Directory of people and counterparty entities (`id`, `userId`, `userType`, `name`, `relation`, `aliases`, `contactType`, `isSilenced`, `transactionCount`). <br> *Indexes:* `(userId, userType)`. |
| `pendingClarifications`| `pending_clarifications`| Incomplete transactions awaiting interactive review (`id`, `userId`, `userType`, `expenseId`, `question`, `originalText`, `status`, `contextData`). <br> *Indexes:* `(userId, userType)`, `status`, `expenseId`. |

---

### Group D: AI Layer & Behavioral Memory (12 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `aiSummaries` | `ai_summaries` | AI generated spending trend analyses (`userId`, `userType`, `period`, `periodValue`, `content`). <br> *Indexes:* unique `ai_summary_period_idx` on `(userId, userType, period, periodValue)`. |
| `aiConversationSummaries`| `ai_conversation_summaries`| Preserves LLM token budget (`conversationId`, `userId`, `userType`, `capsule`, `runningSummary`, `messageCount`). <br> *Indexes:* unique `conversationId`, `(userId, userType)`, `updatedAt`. |
| `aiMemoryItems` | `ai_memory_items` | Persistent preferences (`userId`, `userType`, `memoryType`, `content`, `contentHash`, `importance`, `sourceConversationId`, `sourceMessageId`, `status`). <br> *Indexes:* `(userId, userType, status)`, unique `(userId, userType, contentHash)`, `memoryType`, `updatedAt`, `sourceConversationId`, `sourceMessageId`. |
| `aiMemoryEmbeddings`| `ai_memory_embeddings`| 768-dim Fireworks vector embeddings (`memoryItemId`, `userId`, `userType`, `provider`, `model`, `dimensions`, `vector`). <br> *Indexes:* `(userId, userType)`, unique `ai_memory_embedding_unique_idx` on `(memoryItemId, provider, model, dimensions)`. |
| `aiActionMemory` | `ai_action_memory` | Autonomous agent memory (`userId`, `userType`, `actionName`, `status`, `summary`, `payload`, `sourceConversationId`). <br> *Indexes:* `(userId, userType)`, `(actionName, status)`, `updatedAt`, `sourceConversationId`. |
| `aiPendingActions`| `ai_pending_actions` | Action proposal drafts awaiting user UI confirmation (`id`, `userId`, `userType`, `conversationId`, `actionName`, `status`, `risk`, `payload`, `idempotencyKey`, `expiresAt`). <br> *Indexes:* `(userId, userType, status)`, `expiresAt`, `conversationId`, `idempotencyKey`. |
| `aiActionAuditLogs`| `ai_action_audit_logs`| AI compliance and execution audit trail (`actionId`, `userId`, `userType`, `actionName`, `event`, `status`). <br> *Indexes:* `actionId`, `(userId, userType)`, `event`. |
| `classificationLogs`| `classification_logs` | 5-layer classification traces (`userId`, `userType`, `originalText`, `parsedBy`, `finalResult`, `confidence`, `wasCorrected`, `tokensUsed`, `createdAt`). <br> *Indexes:* `(userId, userType)`, `parsedBy`, `createdAt`. |
| `onboardingQuestions`| `onboarding_questions`| Setup questionnaire catalog (`questionKey`, `questionText`, `inputType`, `options`, `isActive`). |
| `userDictionaries`| `user_dictionaries` | Personal slang & dictionary overrides (`userId`, `userType`, `word`, `category`, `subCategory`). <br> *Indexes:* unique `user_dict_word_unique` on `(userId, userType, word)`. |
| `profileLearningEvents`| `profile_learning_events`| Profile evolution audit trail (`userId`, `userType`, `eventType`, `previousAttributes`, `newAttributes`). <br> *Indexes:* `(userId, userType)`, `eventType`. |
| `monthlyBehaviorSnapshots`| `monthly_behavior_snapshots`| Longitudinal user behavior vector snapshots (`userId`, `userType`, `month`, `totalIncome`, `totalExpense`, `behaviorFlags`). <br> *Indexes:* unique `(userId, userType, month)`, `month`. |

---

### Group E: Conversational AI & Communications (5 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `chatConversations`| `chat_conversations`| AI chat threads (`id`, `userId`, `userType`, `title`, `messageCount`, `totalTokens`, `metadata`, `lastMessageAt`). <br> *Indexes:* `(userId, userType)`, `lastMessageAt`. |
| `chatMessages` | `chat_messages` | Chat message turns (`conversationId`, `role`, `content`, `toolCalls`, `toolResults`, `tokensUsed`, `model`). <br> *Indexes:* `chat_msg_created_idx` on `(conversationId, createdAt)`. |
| `rawSmsEvents` | `raw_sms_events` | Captured bank SMS payloads (`userId`, `userType`, `message`, `sender`, `status`). <br> *Indexes:* `(userId, userType)`, `status`. |
| `whatsappOtpCodes`| `whatsapp_otp_codes`| Phone pairing verification challenges (`phone`, `code`, `verified`, `expiresAt`). <br> *Indexes:* `phone`. |
| `voiceUsage` | `voice_usage` | Duration and costs of voice STT operations (`userId`, `userType`, `durationSeconds`, `month`, `source`). <br> *Indexes:* `(userId, userType, month)`. |

---

### Group F: System Operations & Notifications (15 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `systemSettings` | `system_settings` | Global dynamic key-value configurations (`key`, `value`, `description`, `isPublic`). |
| `userProfiles` | `user_profiles` | Demographic and behavioral profile data (`userId`, `userType`, `lifestyleInfo`, `financialInfo`). <br> *Indexes:* unique `(userId, userType)`. |
| `userAnalytics` | `user_analytics` | UI telemetry clickstream (`userId`, `userType`, `event`, `metadata`). <br> *Indexes:* `(userId, userType)`, `event`, `createdAt`. |
| `supportTickets` | `support_tickets` | User issues & support cases (`userId`, `userType`, `subject`, `status`, `assignedTo`). <br> *Indexes:* `(userId, userType)`, `status`, `assignedTo`. |
| `discountCodes` | `discount_codes` | Promo and referral discounts (`code`, `type`, `discountPercent`, `createdBy`). <br> *Indexes:* `createdBy`. |
| `ads` | `ads` | In-app sponsorship cards (`title`, `imageUrl`, `targetUrl`, `createdBy`, `isActive`). <br> *Indexes:* `(createdBy, isActive)`. |
| `adClicks` | `ad_clicks` | Ad click logs (`adId`, `userId`, `userType`, `clickedAt`). <br> *Indexes:* `(adId, userId, userType)`. |
| `referrals` | `referrals` | Referral tracking (`referrerId`, `referrerType`, `referredId`, `referredType`, `status`, `rewardGiven`). <br> *Indexes:* `(referrerId, referrerType)`, unique `referral_referred_unique_idx` on `(referredId, referredType)`. |
| `proSubscriptions`| `pro_subscriptions` | Paid tier subscriptions (`userId`, `userType`, `plan`, `provider`, `status`, `startDate`, `endDate`). <br> *Indexes:* `(userId, userType)`, `status`. |
| `seoPages` | `seo_pages` | Dynamic SEO landing pages (`path`, `title`, `description`). <br> *Indexes:* unique `path`. |
| `apiKeyErrors` | `api_key_errors` | External API errors (`provider`, `keyLabel`, `errorType`, `userId`, `resolved`). <br> *Indexes:* `provider`, `errorType`, `resolved`, `createdAt`, `userId`. |
| `pushSubscriptions`| `push_subscriptions`| WebPush & Firebase FCM push tokens (`userId`, `userType`, `endpoint`, `fcmToken`). <br> *Indexes:* `(userId, userType)`. |
| `notificationTemplates`| `notification_templates`| Multi-channel notification templates (`name`, `eventType`, `targetSegment`, `createdBy`). <br> *Indexes:* `createdBy`, `eventType`. |
| `inAppNotifications`| `in_app_notifications`| User in-app bell alerts (`userId`, `userType`, `title`, `body`, `isRead`). <br> *Indexes:* `(userId, userType)`, `isRead`. |
| `notificationLogs`| `notification_logs` | Multi-channel delivery history logs (`templateId`, `userId`, `userType`, `sentVia`, `status`). <br> *Indexes:* `(userId, userType)`, `templateId`. |

---

## 2. 🔗 Complete Relational Graph (`db/relations.ts`)

- **Total Exported Relations:** Exactly **44 relation blocks** are exported in `db/relations.ts`.
- **Dual-User Identity Relations:** Both `usersRelations` and `localUsersRelations` export relations covering all 35 user-scoped tables, including `expenses`, `userWallets`, `userBudgets`, `financialGoals`, `userContacts`, `adClicks`, `aiMemoryEmbeddings`, `authChallenges`, `classificationLogs`, `discountCodes`, `apiKeyErrors`, `referralsMade`, and `referralsReceived`.
- **Complete Standalone Exports:** `discountCodesRelations`, `referralsRelations`, and `apiKeyErrorsRelations` are fully exported.
- **Relational Query Example:**
  ```typescript
  const userExpenses = await db.query.expenses.findMany({
    where: eq(expenses.userId, userId),
    with: {
      localUser: true,
      oauthUser: true,
      contact: true,
      wallet: true,
      classificationLog: true,
      business: true,
    },
  });
  ```

---

## 3. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Redundant Left-Prefix Index Optimizations
* **Optimization:** `monthlyReports` indexes were optimized by removing `reports_user_idx` on `(userId, userType)`. In MySQL B-Tree indexing, any query on `(userId, userType)` is 100% satisfied by the leftmost prefix of `uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month)`, eliminating redundant index page writes and memory usage.

### B. Wallet Foreign Key & Index (`walletId`)
* **Rule:** Always query wallet transactions via `eq(expenses.walletId, walletId)` utilizing the `expenses_wallet_idx` index. Never use text `LIKE` matching across descriptions.

### C. Idempotency & Network Safety (`clientRequestId`)
* **Rule:** All mobile/web clients generate a unique `clientRequestId` (UUID) per expense mutation. The `expenses_user_client_request_unique` index ensures network retries never create duplicate ledger entries.

### D. ACID Financial Mutations (`db.transaction()`)
* **Rule:** Ledger mutations (`create`, `batchCreate`, `delete`) must run inside `db.transaction()`. If an expense is deleted, the contact's `transactionCount` is automatically decremented atomically.

### E. Universal 35-Table Data Purge Cascade (`purgeUserData`)
* **Rule:** User deletion requests must invoke `purgeUserData(tx, userId, userType)` in `api/services/user-purge-service.ts`. This executes a transactional cascading deletion across all 35 user-owned tables, chat message hierarchies, business categories, and identity tables within a single database transaction.
