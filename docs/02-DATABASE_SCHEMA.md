# SmartSpend AI — Database Schema Reference (All 48 Tables)

> **AI AGENT SSOT:** This document defines the MySQL database groups, 100% Drizzle ORM relationships (`db/relations.ts`), indexes, and schema-specific development gotchas.

---

## 1. 🗄️ Database Logical Groups (48 Tables)

### Group A: Identity & Sessions (6 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `users` | `users` | `id`, `name`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `currentStreak`, `highestStreak`, `lastStreakAt`. <br> *Indexes:* `role`, `plan`, `referralCode`, `referredBy`. |
| `localUsers` | `local_users` | `id`, `name`, `phone`, `password`, `email`, `avatar`, `role`, `plan`, `referralCode`, `referredBy`, `aiTokensUsed`, `currentStreak`, `highestStreak`, `lastStreakAt`. <br> *Indexes:* `role`, `plan`, `referredBy`. |
| `sessions` | `sessions` | `id`, `token`, `userId`, `userType`, `expiresAt`. <br> *Indexes:* `(userId, userType)`, `token`, `expiresAt`. |
| `userCredentials`| `user_credentials` | WebAuthn credentials (`id`, `userId`, `userType`, `publicKey`, `counter`, `deviceType`, `backedUp`, `transports`, `lastUsedAt`). <br> *Indexes:* `(userId, userType)`. |
| `authChallenges` | `auth_challenges` | Ephemeral challenge tokens used during biometric sign-ins (`id`, `challenge`, `userId`, `userType`, `expiresAt`). <br> *Indexes:* `(userId, userType)`. |
| `webhookTokens` | `webhook_tokens` | Secure user tokens for Android/iOS companion apps (`token`, `userId`, `userType`, `name`). <br> *Indexes:* `(userId, userType)`, `token`. |

---

### Group B: Financial Core Ledger (6 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `expenses` | `expenses` | `id`, `userId`, `userType`, `type`, `amount`, `category`, `subCategory`, `description`, `rawText`, `source`, `placeHint`, `parsedMetadata`, `contactId`, `classificationLogId`, `businessId`, `walletId`, `clientRequestId`, `date`, `status`. <br> *Indexes:* `(userId, userType)`, `date`, `(userId, userType, date)`, `type`, `category`, `status`, `businessId`, `contactId`, `classificationLogId`, `walletId`, unique `(userId, userType, clientRequestId)`. |
| `expenseCategories`| `expense_categories` | User-defined and system categories (`id`, `userId`, `userType`, `name`, `icon`, `color`, `isDefault`). <br> *Indexes:* `(userId, userType)`. |
| `userWallets` | `user_wallets` | Accounts (`id`, `userId`, `userType`, `name`, `provider`, `lastFourDigits`, `balance`). <br> *Indexes:* `(userId, userType)`. |
| `financialGoals` | `financial_goals` | Savings/debt goals (`id`, `userId`, `userType`, `title`, `targetAmount`, `targetDate`, `status`, `aiPlan`, `aiAlerts`). <br> *Indexes:* `(userId, userType)`, `status`. |
| `userBudgets` | `user_budgets` | Budget limits (`id`, `userId`, `userType`, `title`, `category`, `monthlyLimit`, `linkedGoalId`, `status`, `alertThresholdPercent`). <br> *Indexes:* `(userId, userType, status)`, `category`, `linkedGoalId`. |
| `monthlyReports` | `monthly_reports` | Compiled monthly spending summaries (`id`, `userId`, `userType`, `month`, `totalAmount`, `totalIncome`, `categoryBreakdown`, `insights`, `aiReport`). <br> *Indexes:* `(userId, userType)`, `month`. |

---

### Group C: Freelance & Contact Relationships (4 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `userBusinesses` | `user_businesses` | Freelancer/business mode ledger (`id`, `userId`, `userType`, `name`, `type`, `isActive`). <br> *Indexes:* `(userId, userType)`, `isActive`. |
| `businessCategories`| `business_categories`| Tax deduction codes & business classifications (`businessId`, `name`, `nameAr`, `type`, `keywords`). <br> *Indexes:* `businessId`. |
| `userContacts` | `user_contacts` | Directory of contacts (`id`, `userId`, `userType`, `name`, `relationship`, `isSilenced`, `transactionCount`). <br> *Indexes:* `(userId, userType)`. |
| `pendingClarifications`| `pending_clarifications`| Incomplete transactions waiting for user review (`id`, `userId`, `userType`, `expenseId`, `question`, `originalText`, `status`, `contextData`). <br> *Indexes:* `(userId, userType)`, `status`, `expenseId`. |

---

### Group D: AI Layer & Behavioral Memory (12 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `aiSummaries` | `ai_summaries` | AI generated spending trend analyses (`userId`, `userType`, `period`, `periodValue`, `content`). <br> *Indexes:* `(userId, userType)`, unique `(userId, userType, period, periodValue)`. |
| `aiConversationSummaries`| `ai_conversation_summaries`| Preserves LLM token budget (`conversationId`, `userId`, `userType`, `capsule`, `runningSummary`, `messageCount`). <br> *Indexes:* unique `conversationId`, `(userId, userType)`, `updatedAt`. |
| `aiMemoryItems` | `ai_memory_items` | Persistent preferences (`userId`, `userType`, `memoryType`, `content`, `contentHash`, `importance`, `sourceConversationId`, `sourceMessageId`, `status`). <br> *Indexes:* `(userId, userType, status)`, unique `(userId, userType, contentHash)`, `memoryType`, `updatedAt`, `sourceConversationId`, `sourceMessageId`. |
| `aiMemoryEmbeddings`| `ai_memory_embeddings`| 768-dim Fireworks vector embeddings (`memoryItemId`, `userId`, `userType`, `provider`, `model`, `dimensions`, `vector`). <br> *Indexes:* `memoryItemId`, `(userId, userType)`, unique `(memoryItemId, provider, model, dimensions)`. |
| `aiActionMemory` | `ai_action_memory` | Autonomous agent memory (`userId`, `userType`, `actionName`, `status`, `summary`, `payload`, `sourceConversationId`). <br> *Indexes:* `(userId, userType)`, `(actionName, status)`, `updatedAt`, `sourceConversationId`. |
| `aiPendingActions`| `ai_pending_actions` | Action proposal drafts awaiting user confirmation (`id`, `userId`, `userType`, `conversationId`, `actionName`, `status`, `risk`, `payload`, `idempotencyKey`, `expiresAt`). <br> *Indexes:* `(userId, userType, status)`, `expiresAt`, `conversationId`, `idempotencyKey`. |
| `aiActionAuditLogs`| `ai_action_audit_logs`| AI compliance logs (`actionId`, `userId`, `userType`, `actionName`, `event`, `status`). <br> *Indexes:* `actionId`, `(userId, userType)`, `event`. |
| `classificationLogs`| `classification_logs` | Audit trail for the 5-layer pipeline (`originalText`, `parsedBy`, `finalResult`, `confidence`, `wasCorrected`, `tokensUsed`, `createdAt`). <br> *Indexes:* `(userId, userType)`, `parsedBy`, `createdAt`. |
| `onboardingQuestions`| `onboarding_questions`| Setup questionnaire records (`questionKey`, `questionText`, `inputType`, `options`, `isActive`). |
| `userDictionaries`| `user_dictionaries` | Custom user vocabulary overrides (`userId`, `userType`, `word`, `category`, `subCategory`). <br> *Indexes:* `(userId, userType)`, unique `(userId, userType, word)`. |
| `profileLearningEvents`| `profile_learning_events`| Events recorded when users correct AI predictions (`userId`, `userType`, `eventType`, `previousAttributes`, `newAttributes`). <br> *Indexes:* `(userId, userType)`, `eventType`. |
| `monthlyBehaviorSnapshots`| `monthly_behavior_snapshots`| Longitudinal user behavior vector snapshots (`userId`, `userType`, `month`, `totalIncome`, `totalExpense`, `behaviorFlags`). <br> *Indexes:* unique `(userId, userType, month)`, `month`. |

---

### Group E: Conversational AI & Logs (5 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `chatConversations`| `chat_conversations`| AI chat threads (`id`, `userId`, `userType`, `title`, `messageCount`, `totalTokens`, `metadata`, `lastMessageAt`). <br> *Indexes:* `(userId, userType)`, `lastMessageAt`. |
| `chatMessages` | `chat_messages` | Chat message turns (`conversationId`, `role`, `content`, `toolCalls`, `toolResults`, `tokensUsed`, `model`). <br> *Indexes:* `conversationId`, `(conversationId, createdAt)`. |
| `rawSmsEvents` | `raw_sms_events` | Captured bank SMS payloads (`userId`, `userType`, `message`, `sender`, `status`). <br> *Indexes:* `(userId, userType)`, `status`. |
| `whatsappOtpCodes`| `whatsapp_otp_codes`| Phone pairing verification challenges (`phone`, `code`, `verified`, `expiresAt`). <br> *Indexes:* `phone`. |
| `voiceUsage` | `voice_usage` | Duration and costs of voice STT operations (`userId`, `userType`, `durationSeconds`, `month`, `source`). <br> *Indexes:* `(userId, userType, month)`. |

---

### Group F: System Operations & Notifications (15 Tables)
| Table Variable | SQL Table Name | Key Columns & Indexes |
| :--- | :--- | :--- |
| `systemSettings` | `system_settings` | Global configurations: models, base URLs, and API keys. |
| `userProfiles` | `user_profiles` | Demographic and behavioral profile data (`userId`, `userType`, `lifestyleInfo`, `financialInfo`). <br> *Indexes:* unique `(userId, userType)`. |
| `userAnalytics` | `user_analytics` | UI clickstream metrics (`userId`, `userType`, `eventName`, `eventData`). <br> *Indexes:* `(userId, userType)`, `eventName`, `createdAt`. |
| `supportTickets` | `support_tickets` | User issues & support cases (`userId`, `userType`, `subject`, `status`, `assignedTo`). <br> *Indexes:* `(userId, userType)`, `status`, `assignedTo`. |
| `discountCodes` | `discount_codes` | Promo and referral discounts (`code`, `type`, `discountPercent`, `createdBy`). <br> *Indexes:* `createdBy`. |
| `ads`, `adClicks` | `ads`, `ad_clicks` | Native sponsorships and click logs (`createdBy`, `isActive`, `adId`). <br> *Indexes:* `ads(createdBy, isActive)`, `adClicks(adId, userId, userType)`. |
| `referrals` | `referrals` | Referral tracking (`referrerId`, `referrerType`, `referredId`, `referredType`, `rewardStatus`). <br> *Indexes:* `(referrerId, referrerType)`, `(referredId, referredType)`. |
| `proSubscriptions`| `pro_subscriptions` | Subscription state (`userId`, `userType`, `plan`, `provider`, `status`, `currentPeriodEnd`). <br> *Indexes:* `(userId, userType)`, `status`. |
| `seoPages` | `seo_pages` | Landing page details & dynamic slugs (`slug`, `title`, `metaDescription`). <br> *Indexes:* unique `slug`. |
| `apiKeyErrors` | `api_key_errors` | External API errors (`provider`, `keyLabel`, `errorType`, `userId`, `resolved`). <br> *Indexes:* `provider`, `errorType`, `resolved`, `createdAt`, `userId`. |
| `pushSubscriptions`| `push_subscriptions`| WebPush & Firebase push tokens (`userId`, `userType`, `endpoint`, `fcmToken`). <br> *Indexes:* `(userId, userType)`. |
| `notificationTemplates`| `notification_templates`| Notification templates (`name`, `eventType`, `targetSegment`, `createdBy`). <br> *Indexes:* `createdBy`, `eventType`. |
| `inAppNotifications`| `in_app_notifications`| User bell alerts (`userId`, `userType`, `title`, `body`, `isRead`). <br> *Indexes:* `(userId, userType)`, `isRead`. |
| `notificationLogs`| `notification_logs` | Notification send history logs (`templateId`, `userId`, `userType`, `sentVia`, `status`). <br> *Indexes:* `(userId, userType)`, `templateId`. |

---

## 2. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. 100% Relational Coverage (`db/relations.ts`)
* **Rule:** All 48 tables have full relations mapped in `db/relations.ts`.
* **Dual User Mapping:** Every table with `userId` and `userType` exports both `localUser` and `oauthUser` relations:
  ```typescript
  export const expensesRelations = relations(expenses, ({ one }) => ({
    localUser: one(localUsers, { fields: [expenses.userId], references: [localUsers.id] }),
    oauthUser: one(users, { fields: [expenses.userId], references: [users.id] }),
    contact: one(userContacts, { fields: [expenses.contactId], references: [userContacts.id] }),
    wallet: one(userWallets, { fields: [expenses.walletId], references: [userWallets.id] }),
  }));
  ```

### B. Wallet Foreign Key & Index (`walletId`)
* **Rule:** Always query wallet transactions via `eq(expenses.walletId, walletId)` utilizing the `expenses_wallet_idx` index. Never use text `LIKE` matching across descriptions.

### C. Idempotency & Network Safety (`clientRequestId`)
* **Rule:** All mobile/web clients generate a unique `clientRequestId` (UUID) per expense mutation. The `expenses_user_client_request_unique` index ensures network retries never create duplicate ledger entries.

### D. ACID Financial Mutations (`db.transaction()`)
* **Rule:** Ledger mutations (`create`, `batchCreate`, `delete`) must run inside `db.transaction()`. If an expense is deleted, the contact's `transactionCount` is automatically decremented atomically.

