# SmartSpend AI — Database Schema Reference (48 Tables)

> **AI AGENT SSOT:** This document defines the MySQL database groups, relationships, and schema-specific development gotchas.

---

## 1. 🗄️ Database Logical Groups (48 Tables)

### Group A: Identity & Sessions (6 Tables)
| Table Variable | SQL Table Name | Key Columns & Pointers |
| :--- | :--- | :--- |
| `users` | `users` | `id`, `name`, `email`, `avatar`, `role`, `plan` (OAuth). |
| `localUsers` | `local_users` | `id`, `name`, `password_hash`, `phone`, `role`, `plan` (Local). |
| `sessions` | `sessions` | `id`, `token`, `userId`, `userType` (OAuth vs Local). |
| `userCredentials`| `user_credentials` | WebAuthn credentials, public key strings, device counters. |
| `authChallenges` | `auth_challenges` | Ephemeral challenge tokens used during biometric sign-ins. |
| `webhookTokens` | `webhook_tokens` | Secure user tokens for third-party Android/iOS SMS ingest. |

---

### Group B: Financial Core Ledger (6 Tables)
| Table Variable | SQL Table Name | Key Columns & Pointers |
| :--- | :--- | :--- |
| `expenses` | `expenses` | `id`, `amount`, `currency`, `categoryId`, `merchant`, `walletId`. |
| `expenseCategories`| `expense_categories` | User-defined or global system expense categories. |
| `userWallets` | `user_wallets` | Accounts (Cash, Bank, Vodafone Cash, InstaPay, Credit Card). |
| `financialGoals` | `financial_goals` | Savings/debt goals, targets, dates, current savings. |
| `userBudgets` | `user_budgets` | Budget limits mapped per category or user wallet. |
| `monthlyReports` | `monthly_reports` | Compiled monthly spending data, averages, and fact metrics. |

---

### Group C: Freelance & Contact Relationships (4 Tables)
| Table Variable | SQL Table Name | Key Columns & Pointers |
| :--- | :--- | :--- |
| `userBusinesses` | `user_businesses` | Business mode ledgers for freelancers and entrepreneurs. |
| `businessCategories`| `business_categories`| Tax deduction codes and business categorizations. |
| `userContacts` | `user_contacts` | Directory of people, friends, clients, debtors, creditors. |
| `pendingClarifications`| `pending_clarifications`| Incomplete transactions waiting for user categorization reviews. |

---

### Group D: AI Layer & Behavioral Memory (12 Tables)
| Table Variable | SQL Table Name | Key Columns & Pointers |
| :--- | :--- | :--- |
| `aiSummaries` | `ai_summaries` | Daily/weekly AI generated spending trend analyses. |
| `aiConversationSummaries`| `ai_conversation_summaries`| Preserves LLM token budget by summarizing chat histories. |
| `aiMemoryItems` | `ai_memory_items` | AI behavioral memory slots for personalized financial recommendations. |
| `aiMemoryEmbeddings`| `ai_memory_embeddings`| Vector embeddings mapped to user memories for semantic checks. |
| `aiActionMemory` | `ai_action_memory` | Tracks autonomous actions taken by the AI. |
| `aiPendingActions`| `ai_pending_actions` | Actions that must be approved by the user (e.g. transfers). |
| `aiActionAuditLogs`| `ai_action_audit_logs`| Audit logs for compliance of AI transaction changes. |
| `classificationLogs`| `classification_logs` | Performance statistics and logs for the 5-layer pipeline. |
| `onboardingQuestions`| `onboarding_questions`| Setup questionnaire records for model calibration. |
| `userDictionaries`| `user_dictionaries` | Custom Egyptian/Arabic names mapped per user. |
| `profileLearningEvents`| `profile_learning_events`| Events recorded when users correct AI predictions. |
| `monthlyBehaviorSnapshots`| `monthly_behavior_snapshots`| Longitudinal user behavior vector snapshots. |

---

### Group E: Conversational AI & Logs (5 Tables)
| Table Variable | SQL Table Name | Key Columns & Pointers |
| :--- | :--- | :--- |
| `chatConversations`| `chat_conversations`| AI chat threads. |
| `chatMessages` | `chat_messages` | Chat queries and assistant responses (with tool metadata). |
| `rawSmsEvents` | `raw_sms_events` | Captured bank SMS payloads before classification. |
| `whatsappOtpCodes`| `whatsapp_otp_codes`| Phone pairing verification challenges. |
| `voiceUsage` | `voice_usage` | Duration and costs of voice STT operations. |

---

### Group F: System Operations & Notifications (15 Tables)
| Table Variable | SQL Table Name | Key Columns & Pointers |
| :--- | :--- | :--- |
| `systemSettings` | `system_settings` | Global configurations: models, base URLs, and API keys. |
| `userProfiles` | `user_profiles` | Additional demographic profile data. |
| `userAnalytics` | `user_analytics` | UI clickstream metrics. |
| `supportTickets` | `support_tickets` | User issues. |
| `discountCodes` | `discount_codes` | Promo codes. |
| `ads`, `adClicks` | `ads`, `ad_clicks` | Native sponsorships. |
| `referrals` | `referrals` | Referral tracking. |
| `proSubscriptions`| `pro_subscriptions` | Plan state. |
| `seoPages` | `seo_pages` | Landing page details. |
| `apiKeyErrors` | `api_key_errors` | External API errors. |
| `pushSubscriptions`| `push_subscriptions`| Firebase push tokens. |
| `notificationTemplates`| `notification_templates`| Alert templates. |
| `inAppNotifications`| `in_app_notifications`| Bell alerts. |
| `notificationLogs`| `notification_logs` | Send history logs. |

---

## 2. 🚨 Critical Gotchas & Execution Pointers (MUST READ)

### A. Dual User Joins (`users` vs `localUsers`)
* **Gotcha:** Do not join/query only `users` for system-wide user counts.
* **Rule:** You must query both `users` and `localUsers` tables and normalize results using the `UnifiedUser` type schema.

### B. `isSilenced` Bypass Flag (`pendingClarifications`)
* **Gotcha:** Ambiguous name matches will spam the user with clarifications unless suppressed.
* **Rule:** If resolving an entity (`narrative-decomposer.ts`) and the target contact has `userContacts.isSilenced === true`, skip inserting into `pendingClarifications`.

### C. Relational Query Joins (`db/relations.ts`)
* **Gotcha:** Adding a foreign key relation in `db/schema.ts` is not enough for `db.query` relational helper calls.
* **Rule:** You must add the matching `relations` definitions inside `db/relations.ts`. Otherwise, queries using `with:` will fail at runtime.

### D. Vector Embeddings (`aiMemoryEmbeddings`)
* **Gotcha:** Do not write raw array inserts into vector columns.
* **Rule:** Always format vector values using `embedding-engine.ts` (expects Fireworks `qwen3-embedding-8b` 768-dimension vectors).
