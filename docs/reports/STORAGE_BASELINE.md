# SmartSpend Database Storage Baseline (P0)

*Generated at:* 2026-09-08T06:39:30.510Z
*Database:* `smartspend`
*Total Tables Measured:* 56
*Total Estimated Rows:* ١٬٥٢٠
*Total Data Size:* 1.81 MB (١٬٩٠٠٬٥٤٤ bytes)
*Total Index Size:* 1.75 MB (١٬٨٣٥٬٠٠٨ bytes)
*Total Database Size:* 3.56 MB (٣٬٧٣٥٬٥٥٢ bytes)

## 1. Table Class Breakdown

| Class | Name | Tables | Total Size | Lifetime Rule |
| :---: | :--- | ---: | ---: | :--- |
| **A** | Identity & Config | 21 | 880.00 KB | Forever |
| **B** | Core Ledger | 2 | 288.00 KB | Forever |
| **C** | Derived / Rollup | 8 | 288.00 KB | Forever (cheap) |
| **D** | Operational / Ephemeral | 7 | 496.00 KB | Minutes -> days |
| **E** | Telemetry / Logs | 10 | 960.00 KB | 30–365 days |
| **F** | AI Memory | 6 | 496.00 KB | Forever (items), rebuildable (vectors) |
| **G** | Conversation | 2 | 240.00 KB | 90 days raw |

## 2. Table Storage Overview

| Table Name | Class | Rows | Data Size | Index Size | Total Size | Index Count |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: |
| `user_analytics` | **E** | ٦٢٣ | 304.00 KB | 32.00 KB | 336.00 KB | 3 |
| `classification_logs` | **E** | ٦١ | 224.00 KB | 48.00 KB | 272.00 KB | 4 |
| `expenses` | **B** | ١١٤ | 64.00 KB | 176.00 KB | 240.00 KB | 12 |
| `chat_messages` | **G** | ٨٦ | 176.00 KB | 16.00 KB | 192.00 KB | 2 |
| `ai_memory_embeddings` | **F** | ٥ | 96.00 KB | 48.00 KB | 144.00 KB | 3 |
| `pending_clarifications` | **D** | ٢٢ | 80.00 KB | 48.00 KB | 128.00 KB | 4 |
| `sessions` | **D** | ١٠٣ | 64.00 KB | 64.00 KB | 128.00 KB | 5 |
| `ai_memory_items` | **F** | ٧ | 16.00 KB | 96.00 KB | 112.00 KB | 7 |
| `users` | **A** | ٣ | 16.00 KB | 96.00 KB | 112.00 KB | 7 |
| `ai_conversation_summaries` | **F** | ٢٣ | 48.00 KB | 48.00 KB | 96.00 KB | 4 |
| `api_key_errors` | **E** | ٢ | 16.00 KB | 80.00 KB | 96.00 KB | 6 |
| `local_users` | **A** | ٤٦ | 16.00 KB | 80.00 KB | 96.00 KB | 6 |
| `user_contacts` | **A** | ٢٦ | 16.00 KB | 80.00 KB | 96.00 KB | 6 |
| `ai_pending_actions` | **D** | ٣ | 16.00 KB | 64.00 KB | 80.00 KB | 5 |
| `ai_action_audit_logs` | **E** | ٣ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `ai_action_memory` | **F** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 5 |
| `support_tickets` | **A** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `user_budgets` | **C** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `webhook_tokens` | **D** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 3 |
| `ai_summaries` | **C** | ١٨ | 16.00 KB | 32.00 KB | 48.00 KB | 2 |
| `business_categories` | **A** | ٢ | 16.00 KB | 32.00 KB | 48.00 KB | 2 |
| `chat_conversations` | **G** | ٢٩ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `expense_details` | **B** | ١٥٨ | 48.00 KB | 0 B | 48.00 KB | 1 |
| `financial_goals` | **C** | ٥ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `in_app_notifications` | **D** | ٤ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `monthly_behavior_snapshots` | **C** | ١ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `profile_learning_events` | **E** | ١ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `raw_sms_events` | **E** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `user_businesses` | **A** | ١ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `user_dictionaries` | **F** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 2 |
| `ai_models` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 4 |
| `ai_providers` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 4 |
| `ai_token_ledgers` | **E** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 6 |
| `auth_challenges` | **D** | ٥ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `discount_codes` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 3 |
| `expense_daily_rollups` | **C** | ٣٣ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `onboarding_questions` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `pro_subscriptions` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `push_subscriptions` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `referrals` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 3 |
| `seo_pages` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `user_correction_rules` | **F** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 3 |
| `user_credentials` | **A** | ٢ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `user_profiles` | **A** | ١ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `user_wallets` | **A** | ٢ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `voice_usage` | **E** | ٢٦ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `ad_clicks` | **E** | ٠ | 16.00 KB | 0 B | 16.00 KB | 3 |
| `ad_stats_daily` | **C** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `ads` | **A** | ٠ | 16.00 KB | 0 B | 16.00 KB | 3 |
| `ai_cost_monthly` | **C** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `expense_categories` | **A** | ٠ | 16.00 KB | 0 B | 16.00 KB | 2 |
| `monthly_reports` | **C** | ٠ | 16.00 KB | 0 B | 16.00 KB | 3 |
| `notification_logs` | **E** | ٠ | 16.00 KB | 0 B | 16.00 KB | 3 |
| `notification_templates` | **A** | ٤ | 16.00 KB | 0 B | 16.00 KB | 3 |
| `system_settings` | **A** | ١٠١ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `whatsapp_otp_codes` | **D** | ٠ | 16.00 KB | 0 B | 16.00 KB | 2 |

## 3. Ten Slowest Hotspots Identified in Audit

1. **Auth Hot Path (`createContext` in `api/context.ts`):** 3-plus synchronous round trips to MySQL on every request (`sessions`, `users`/`local_users`, `pro_subscriptions`).
2. **`expenses.getMonthlyStats` (`api/expense-router.ts`):** Issues unindexed `SELECT *` for entire current and previous month, aggregates via JavaScript `.filter().reduce()` in Node.
3. **`expenses.getYearlyStats` (`api/expense-router.ts`):** `SELECT *` for an entire calendar year, no cache, builds 12-month array in Node memory.
4. **`financeSemanticLayer.loadRowsForPeriod` (`api/services/finance-semantic-layer/resolvers.ts`):** Unbounded `SELECT *` with no `LIMIT` for arbitrary RAG query ranges.
5. **Cache Invalidation on Mutation (`deleteCacheByPattern` in `api/lib/redis-client.ts`):** O(keyspace) full `SCAN` on every expense insert/update/delete.
6. **Finance User Cache Invalidation (`api/services/finance-semantic-layer/cache.ts`):** Uses pattern with wildcard in the middle (`finance_ai:*:<userId>:*`).
7. **AI Memory Vector Scan (`api/services/ai-memory/memory-retriever.ts`):** Fetches up to 160 rows of JSON-encoded float32 embeddings from MySQL, parses JSON in Node, and computes cosine similarity in JS.
8. **Notification Engine Segment Scan (`api/notification-engine.ts`):** Cron runs every minute evaluating correlated subquery `(SELECT count(*) FROM expenses WHERE user_id = ...)` per candidate user.
9. **`chat.getMessages` (`api/chat-router.ts`):** Loads entire conversation history without pagination or bounds.
10. **`admin.getDashboardStats` (`api/admin-router.ts`):** Runs full index scan `SELECT count(*)` over `expenses` and unpaginated reads over `push_subscriptions`.

## 4. Per-Index Inventory

### `user_analytics` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `analytics_event_idx` | NO | `event` | ٩ |
| `analytics_user_idx` | NO | `user_id`, `user_type` | ١٩ |
| `PRIMARY` | YES | `id` | ٦١٧ |

### `classification_logs` (Class E) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `cls_log_date_idx` | NO | `created_at` | ٦١ |
| `cls_log_parsed_idx` | NO | `parsed_by` | ٣ |
| `cls_log_user_idx` | NO | `user_id`, `user_type` | ١١ |
| `PRIMARY` | YES | `id` | ٦١ |

### `expenses` (Class B) — 12 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `expenses_business_idx` | NO | `business_id` | ١ |
| `expenses_category_idx` | NO | `category` | ١٧ |
| `expenses_classification_log_idx` | NO | `classification_log_id` | ٣٣ |
| `expenses_contact_idx` | NO | `contact_id` | ٧ |
| `expenses_covering_rollup_idx` | NO | `user_id`, `user_type`, `business_id`, `date`, `type`, `category`, `sub_category`, `amount` | ١٢ |
| `expenses_date_idx` | NO | `date` | ٧٤ |
| `expenses_status_idx` | NO | `status` | ١ |
| `expenses_type_idx` | NO | `type` | ٣ |
| `expenses_user_client_request_unique` | YES | `user_id`, `user_type`, `client_request_id` | ١٢ |
| `expenses_user_date_idx` | NO | `user_id`, `user_type`, `date` | ١٢ |
| `expenses_wallet_idx` | NO | `wallet_id` | ١ |
| `PRIMARY` | YES | `id` | ١١٤ |

### `chat_messages` (Class G) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `chat_msg_created_idx` | NO | `conversation_id`, `created_at` | ٣١ |
| `PRIMARY` | YES | `id` | ٨٦ |

### `ai_memory_embeddings` (Class F) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_memory_embedding_unique_idx` | YES | `memory_item_id`, `provider`, `model`, `dimensions` | ٥ |
| `ai_memory_embedding_user_idx` | NO | `user_id`, `user_type` | ١ |
| `PRIMARY` | YES | `id` | ٥ |

### `pending_clarifications` (Class D) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `clarifications_expense_idx` | NO | `expense_id` | ١ |
| `clarifications_status_idx` | NO | `status` | ٢ |
| `clarifications_user_idx` | NO | `user_id`, `user_type` | ٦ |
| `PRIMARY` | YES | `id` | ٢٢ |

### `sessions` (Class D) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ١٠٣ |
| `sessions_expires_idx` | NO | `expires_at` | ٩٠ |
| `sessions_token_hash_idx` | YES | `token_hash` | ١٠٣ |
| `sessions_token_idx` | NO | `token` | ١٠٣ |
| `sessions_user_idx` | NO | `user_id`, `user_type` | ٤٦ |

### `ai_memory_items` (Class F) — 7 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_memory_hash_unique_idx` | YES | `user_id`, `user_type`, `content_hash` | ٣ |
| `ai_memory_source_conv_idx` | NO | `source_conversation_id` | ٤ |
| `ai_memory_source_msg_idx` | NO | `source_message_id` | ١ |
| `ai_memory_type_idx` | NO | `memory_type` | ٢ |
| `ai_memory_updated_idx` | NO | `updated_at` | ٦ |
| `ai_memory_user_idx` | NO | `user_id`, `user_type`, `status` | ٣ |
| `PRIMARY` | YES | `id` | ٧ |

### `users` (Class A) — 7 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٣ |
| `users_email_unique` | YES | `email` | ٣ |
| `users_plan_idx` | NO | `plan` | ١ |
| `users_referral_code_unique` | YES | `referral_code` | ٣ |
| `users_referred_by_idx` | NO | `referred_by` | ١ |
| `users_role_idx` | NO | `role` | ١ |
| `users_union_id_unique` | YES | `union_id` | ٣ |

### `ai_conversation_summaries` (Class F) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_conv_summary_unique_idx` | YES | `conversation_id` | ٢٣ |
| `ai_conv_summary_updated_idx` | NO | `updated_at` | ٢٣ |
| `ai_conv_summary_user_idx` | NO | `user_id`, `user_type` | ٨ |
| `PRIMARY` | YES | `id` | ٢٣ |

### `api_key_errors` (Class E) — 6 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `api_key_errors_date_idx` | NO | `created_at` | ٢ |
| `api_key_errors_provider_idx` | NO | `provider` | ١ |
| `api_key_errors_resolved_idx` | NO | `resolved` | ١ |
| `api_key_errors_type_idx` | NO | `error_type` | ١ |
| `api_key_errors_user_idx` | NO | `user_id` | ١ |
| `PRIMARY` | YES | `id` | ٢ |

### `local_users` (Class A) — 6 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `local_users_phone_unique` | YES | `phone` | ٤٦ |
| `local_users_plan_idx` | NO | `plan` | ٢ |
| `local_users_referral_code_unique` | YES | `referral_code` | ٤٦ |
| `local_users_referred_by_idx` | NO | `referred_by` | ١ |
| `local_users_role_idx` | NO | `role` | ٢ |
| `PRIMARY` | YES | `id` | ٤٦ |

### `user_contacts` (Class A) — 6 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `contacts_business_idx` | NO | `business_id` | ١ |
| `contacts_name_idx` | NO | `name` | ٢٠ |
| `contacts_silenced_idx` | NO | `is_silenced` | ٢ |
| `contacts_type_idx` | NO | `contact_type` | ٣ |
| `contacts_user_idx` | NO | `user_id`, `user_type` | ٥ |
| `PRIMARY` | YES | `id` | ٢٦ |

### `ai_pending_actions` (Class D) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_pending_action_conversation_idx` | NO | `conversation_id` | ٣ |
| `ai_pending_action_expiry_idx` | NO | `expires_at` | ٣ |
| `ai_pending_action_idempotency_idx` | NO | `idempotency_key` | ١ |
| `ai_pending_action_user_idx` | NO | `user_id`, `user_type`, `status` | ٣ |
| `PRIMARY` | YES | `id` | ٣ |

### `ai_action_audit_logs` (Class E) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_action_audit_action_idx` | NO | `action_id` | ٣ |
| `ai_action_audit_event_idx` | NO | `event` | ١ |
| `ai_action_audit_user_idx` | NO | `user_id`, `user_type` | ٣ |
| `PRIMARY` | YES | `id` | ٣ |

### `ai_action_memory` (Class F) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_action_memory_action_idx` | NO | `action_name`, `status` | ٠ |
| `ai_action_memory_conv_idx` | NO | `source_conversation_id` | ٠ |
| `ai_action_memory_updated_idx` | NO | `updated_at` | ٠ |
| `ai_action_memory_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `support_tickets` (Class A) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `tickets_assigned_idx` | NO | `assigned_to` | ٠ |
| `tickets_status_idx` | NO | `status` | ٠ |
| `tickets_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `user_budgets` (Class C) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `user_budgets_category_idx` | NO | `category` | ٠ |
| `user_budgets_goal_idx` | NO | `linked_goal_id` | ٠ |
| `user_budgets_user_idx` | NO | `user_id`, `user_type`, `status` | ٠ |

### `webhook_tokens` (Class D) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `webhook_tokens_token_unique` | YES | `token` | ٠ |
| `webhook_tokens_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `ai_summaries` (Class C) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_summary_period_idx` | YES | `user_id`, `user_type`, `period`, `period_value` | ٩ |
| `PRIMARY` | YES | `id` | ١٨ |

### `business_categories` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `business_cat_active_idx` | NO | `business_id`, `is_active` | ١ |
| `PRIMARY` | YES | `id` | ٢ |

### `chat_conversations` (Class G) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `chat_conv_last_msg_idx` | NO | `last_message_at` | ٢٩ |
| `chat_conv_user_idx` | NO | `user_id`, `user_type` | ٧ |
| `PRIMARY` | YES | `id` | ٢٩ |

### `expense_details` (Class B) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `expense_id` | ١٥٣ |

### `financial_goals` (Class C) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `financial_goals_status_idx` | NO | `status` | ١ |
| `financial_goals_user_idx` | NO | `user_id`, `user_type` | ١ |
| `PRIMARY` | YES | `id` | ٥ |

### `in_app_notifications` (Class D) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `in_app_notif_read_idx` | NO | `is_read` | ٢ |
| `in_app_notif_user_idx` | NO | `user_id`, `user_type` | ٣ |
| `PRIMARY` | YES | `id` | ٤ |

### `monthly_behavior_snapshots` (Class C) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `behavior_snapshot_month_idx` | NO | `month` | ١ |
| `behavior_snapshot_user_month_idx` | YES | `user_id`, `user_type`, `month` | ١ |
| `PRIMARY` | YES | `id` | ١ |

### `profile_learning_events` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ١ |
| `profile_learning_event_idx` | NO | `event_type` | ١ |
| `profile_learning_user_idx` | NO | `user_id`, `user_type` | ١ |

### `raw_sms_events` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `raw_sms_status_idx` | NO | `status` | ٠ |
| `raw_sms_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `user_businesses` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `business_active_idx` | NO | `is_active` | ١ |
| `business_user_idx` | NO | `user_id`, `user_type` | ١ |
| `PRIMARY` | YES | `id` | ١ |

### `user_dictionaries` (Class F) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `user_dict_word_unique` | YES | `user_id`, `user_type`, `word` | ٠ |

### `ai_models` (Class A) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_models_active_idx` | NO | `is_active` | ٠ |
| `ai_models_provider_idx` | NO | `provider_id` | ٠ |
| `ai_models_provider_model_idx` | YES | `provider_id`, `model_id` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_providers` (Class A) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_providers_active_idx` | NO | `is_active`, `priority` | ٠ |
| `ai_providers_slug_idx` | NO | `slug` | ٠ |
| `ai_providers_slug_unique` | YES | `slug` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_token_ledgers` (Class E) — 6 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_token_ledgers_trace_id_unique` | YES | `trace_id` | ٠ |
| `idx_ledger_channel` | NO | `channel`, `created_at` | ٠ |
| `idx_ledger_created` | NO | `created_at` | ٠ |
| `idx_ledger_provider` | NO | `provider_slug`, `model_id`, `created_at` | ٠ |
| `idx_ledger_user_period` | NO | `user_id`, `user_type`, `billing_period` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `auth_challenges` (Class D) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `auth_challenges_user_idx` | NO | `user_id`, `user_type` | ٣ |
| `PRIMARY` | YES | `id` | ٥ |

### `discount_codes` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `discount_codes_code_unique` | YES | `code` | ٠ |
| `discount_codes_creator_idx` | NO | `created_by` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `expense_daily_rollups` (Class C) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `expense_daily_rollups_day_idx` | NO | `day` | ٢٤ |
| `expense_daily_rollups_user_day_idx` | YES | `user_id`, `user_type`, `business_id`, `day` | ١٢ |

### `onboarding_questions` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `onboarding_questions_question_key_unique` | YES | `question_key` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `pro_subscriptions` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `pro_sub_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `push_subscriptions` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `push_subs_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `referrals` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `referral_referred_unique_idx` | YES | `referred_id`, `referred_type` | ٠ |
| `referral_unique_idx` | YES | `referrer_id`, `referrer_type`, `referred_id`, `referred_type` | ٠ |

### `seo_pages` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `seo_pages_path_unique` | YES | `path` | ٠ |

### `user_correction_rules` (Class F) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `ucr_user_active_idx` | NO | `user_id`, `user_type`, `is_active` | ٠ |
| `ucr_user_pattern_uq` | YES | `user_id`, `user_type`, `pattern` | ٠ |

### `user_credentials` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `credentials_user_idx` | NO | `user_id`, `user_type` | ٢ |
| `PRIMARY` | YES | `id` | ٢ |

### `user_profiles` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ١ |
| `profile_user_idx` | YES | `user_id`, `user_type` | ١ |

### `user_wallets` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٢ |
| `wallets_user_idx` | NO | `user_id`, `user_type` | ١ |

### `voice_usage` (Class E) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٢٦ |
| `voice_user_month_idx` | NO | `user_id`, `user_type`, `month` | ٣ |

### `ad_clicks` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ad_clicks_ad_idx` | NO | `ad_id` | ٠ |
| `ad_clicks_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ad_stats_daily` (Class C) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ad_stats_daily_idx` | YES | `ad_id`, `day` | ٠ |

### `ads` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ads_active_idx` | NO | `is_active` | ٠ |
| `ads_creator_idx` | NO | `created_by` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_cost_monthly` (Class C) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_cost_monthly_idx` | YES | `user_id`, `user_type`, `billing_period`, `provider_slug`, `model_id` | ٠ |

### `expense_categories` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `categories_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `monthly_reports` (Class C) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `reports_month_idx` | NO | `month` | ٠ |
| `reports_user_month_unique` | YES | `user_id`, `user_type`, `month` | ٠ |

### `notification_logs` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `notif_logs_template_idx` | NO | `template_id` | ٠ |
| `notif_logs_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `notification_templates` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `notif_templates_creator_idx` | NO | `created_by` | ١ |
| `notif_templates_event_idx` | NO | `event_type` | ٤ |
| `PRIMARY` | YES | `id` | ٤ |

### `system_settings` (Class A) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `key` | ١٠١ |

### `whatsapp_otp_codes` (Class D) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `whatsapp_otp_phone_idx` | NO | `phone` | ٠ |

