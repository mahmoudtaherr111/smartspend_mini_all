# SmartSpend Database Storage Baseline (P0)

*Generated at:* 2026-09-04T03:39:46.234Z
*Database:* `smartspend`
*Total Tables Measured:* 54
*Total Estimated Rows:* ٥٥
*Total Data Size:* 864.00 KB (٨٨٤٬٧٣٦ bytes)
*Total Index Size:* 1.66 MB (١٬٧٣٦٬٧٠٤ bytes)
*Total Database Size:* 2.50 MB (٢٬٦٢١٬٤٤٠ bytes)

## 1. Table Class Breakdown

| Class | Name | Tables | Total Size | Lifetime Rule |
| :---: | :--- | ---: | ---: | :--- |
| **A** | Identity & Config | 19 | 768.00 KB | Forever |
| **B** | Core Ledger | 2 | 128.00 KB | Forever |
| **C** | Derived / Rollup | 8 | 304.00 KB | Forever (cheap) |
| **D** | Operational / Ephemeral | 7 | 352.00 KB | Minutes -> days |
| **E** | Telemetry / Logs | 10 | 544.00 KB | 30–365 days |
| **F** | AI Memory | 6 | 368.00 KB | Forever (items), rebuildable (vectors) |
| **G** | Conversation | 2 | 96.00 KB | 90 days raw |

## 2. Table Storage Overview

| Table Name | Class | Rows | Data Size | Index Size | Total Size | Index Count |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: |
| `expenses` | **B** | ٧ | 16.00 KB | 96.00 KB | 112.00 KB | 7 |
| `ai_token_ledgers` | **E** | ٠ | 16.00 KB | 80.00 KB | 96.00 KB | 6 |
| `ai_memory_items` | **F** | ٠ | 16.00 KB | 64.00 KB | 80.00 KB | 5 |
| `api_key_errors` | **E** | ٠ | 16.00 KB | 64.00 KB | 80.00 KB | 5 |
| `local_users` | **A** | ١ | 16.00 KB | 64.00 KB | 80.00 KB | 5 |
| `sessions` | **D** | ٠ | 16.00 KB | 64.00 KB | 80.00 KB | 5 |
| `users` | **A** | ١ | 16.00 KB | 64.00 KB | 80.00 KB | 5 |
| `ai_action_audit_logs` | **E** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `ai_action_memory` | **F** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `ai_conversation_summaries` | **F** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `ai_memory_embeddings` | **F** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 3 |
| `ai_models` | **A** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `ai_pending_actions` | **D** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `ai_providers` | **A** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `classification_logs` | **E** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `support_tickets` | **A** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `user_budgets` | **C** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 4 |
| `webhook_tokens` | **D** | ٠ | 16.00 KB | 48.00 KB | 64.00 KB | 3 |
| `ai_summaries` | **C** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 2 |
| `chat_conversations` | **G** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `chat_messages` | **G** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 2 |
| `financial_goals` | **C** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `in_app_notifications` | **D** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `monthly_behavior_snapshots` | **C** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `notification_logs` | **E** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `pending_clarifications` | **D** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `profile_learning_events` | **E** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `raw_sms_events` | **E** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `referrals` | **A** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `user_analytics` | **E** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `user_contacts` | **A** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `user_correction_rules` | **F** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 3 |
| `user_dictionaries` | **F** | ٠ | 16.00 KB | 32.00 KB | 48.00 KB | 2 |
| `discount_codes` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `expense_daily_rollups` | **C** | ٣ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `monthly_reports` | **C** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `onboarding_questions` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `pro_subscriptions` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `push_subscriptions` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `seo_pages` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `user_credentials` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `user_profiles` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `user_wallets` | **A** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `voice_usage` | **E** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `whatsapp_otp_codes` | **D** | ٠ | 16.00 KB | 16.00 KB | 32.00 KB | 2 |
| `ads` | **A** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `ad_clicks` | **E** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `ad_stats_daily` | **C** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `ai_cost_monthly` | **C** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `auth_challenges` | **D** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `expense_categories` | **A** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `expense_details` | **B** | ٢٤ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `notification_templates` | **A** | ٠ | 16.00 KB | 0 B | 16.00 KB | 1 |
| `system_settings` | **A** | ١٩ | 16.00 KB | 0 B | 16.00 KB | 1 |

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

### `expenses` (Class B) — 7 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `expenses_category_idx` | NO | `category` | ٧ |
| `expenses_covering_rollup_idx` | NO | `user_id`, `user_type`, `business_id`, `date`, `type`, `category`, `sub_category`, `amount` | ٧ |
| `expenses_date_idx` | NO | `date` | ٧ |
| `expenses_status_idx` | NO | `status` | ٢ |
| `expenses_type_idx` | NO | `type` | ٧ |
| `expenses_user_date_idx` | NO | `user_id`, `user_type`, `date` | ٧ |
| `PRIMARY` | YES | `id` | ٧ |

### `ai_token_ledgers` (Class E) — 6 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_token_ledgers_trace_id_unique` | YES | `trace_id` | ٠ |
| `idx_ledger_channel` | NO | `channel`, `created_at` | ٠ |
| `idx_ledger_created` | NO | `created_at` | ٠ |
| `idx_ledger_provider` | NO | `provider_slug`, `model_id`, `created_at` | ٠ |
| `idx_ledger_user_period` | NO | `user_id`, `user_type`, `billing_period` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_memory_items` (Class F) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_memory_hash_unique_idx` | YES | `user_id`, `user_type`, `content_hash` | ٠ |
| `ai_memory_type_idx` | NO | `memory_type` | ٠ |
| `ai_memory_updated_idx` | NO | `updated_at` | ٠ |
| `ai_memory_user_idx` | NO | `user_id`, `user_type`, `status` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `api_key_errors` (Class E) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `api_key_errors_date_idx` | NO | `created_at` | ٠ |
| `api_key_errors_provider_idx` | NO | `provider` | ٠ |
| `api_key_errors_resolved_idx` | NO | `resolved` | ٠ |
| `api_key_errors_type_idx` | NO | `error_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `local_users` (Class A) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `local_users_phone_unique` | YES | `phone` | ١ |
| `local_users_plan_idx` | NO | `plan` | ١ |
| `local_users_referral_code_unique` | YES | `referral_code` | ١ |
| `local_users_role_idx` | NO | `role` | ١ |
| `PRIMARY` | YES | `id` | ١ |

### `sessions` (Class D) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `sessions_expires_idx` | NO | `expires_at` | ٠ |
| `sessions_token_hash_idx` | YES | `token_hash` | ٠ |
| `sessions_token_idx` | NO | `token` | ٠ |
| `sessions_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `users` (Class A) — 5 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ١ |
| `users_plan_idx` | NO | `plan` | ١ |
| `users_referral_code_unique` | YES | `referral_code` | ١ |
| `users_role_idx` | NO | `role` | ١ |
| `users_union_id_unique` | YES | `union_id` | ١ |

### `ai_action_audit_logs` (Class E) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_action_audit_action_idx` | NO | `action_id` | ٠ |
| `ai_action_audit_event_idx` | NO | `event` | ٠ |
| `ai_action_audit_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_action_memory` (Class F) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_action_memory_action_idx` | NO | `action_name`, `status` | ٠ |
| `ai_action_memory_updated_idx` | NO | `updated_at` | ٠ |
| `ai_action_memory_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_conversation_summaries` (Class F) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_conv_summary_unique_idx` | YES | `conversation_id` | ٠ |
| `ai_conv_summary_updated_idx` | NO | `updated_at` | ٠ |
| `ai_conv_summary_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_memory_embeddings` (Class F) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_memory_embedding_unique_idx` | YES | `memory_item_id`, `provider`, `model`, `dimensions` | ٠ |
| `ai_memory_embedding_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_models` (Class A) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_models_active_idx` | NO | `is_active` | ٠ |
| `ai_models_provider_idx` | NO | `provider_id` | ٠ |
| `ai_models_provider_model_idx` | YES | `provider_id`, `model_id` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_pending_actions` (Class D) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_pending_action_conversation_idx` | NO | `conversation_id` | ٠ |
| `ai_pending_action_expiry_idx` | NO | `expires_at` | ٠ |
| `ai_pending_action_user_idx` | NO | `user_id`, `user_type`, `status` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `ai_providers` (Class A) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_providers_active_idx` | NO | `is_active`, `priority` | ٠ |
| `ai_providers_slug_idx` | NO | `slug` | ٠ |
| `ai_providers_slug_unique` | YES | `slug` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `classification_logs` (Class E) — 4 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `cls_log_date_idx` | NO | `created_at` | ٠ |
| `cls_log_parsed_idx` | NO | `parsed_by` | ٠ |
| `cls_log_user_idx` | NO | `user_id`, `user_type` | ٠ |
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
| `ai_summary_period_idx` | YES | `user_id`, `user_type`, `period`, `period_value` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `chat_conversations` (Class G) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `chat_conv_last_msg_idx` | NO | `last_message_at` | ٠ |
| `chat_conv_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `chat_messages` (Class G) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `chat_msg_created_idx` | NO | `conversation_id`, `created_at` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `financial_goals` (Class C) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `financial_goals_status_idx` | NO | `status` | ٠ |
| `financial_goals_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `in_app_notifications` (Class D) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `in_app_notif_read_idx` | NO | `is_read` | ٠ |
| `in_app_notif_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `monthly_behavior_snapshots` (Class C) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `behavior_snapshot_month_idx` | NO | `month` | ٠ |
| `behavior_snapshot_user_month_idx` | YES | `user_id`, `user_type`, `month` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `notification_logs` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `notif_logs_template_idx` | NO | `template_id` | ٠ |
| `notif_logs_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `pending_clarifications` (Class D) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `clarifications_status_idx` | NO | `status` | ٠ |
| `clarifications_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `profile_learning_events` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `profile_learning_event_idx` | NO | `event_type` | ٠ |
| `profile_learning_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `raw_sms_events` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `raw_sms_status_idx` | NO | `status` | ٠ |
| `raw_sms_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `referrals` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `referral_referred_unique_idx` | YES | `referred_id`, `referred_type` | ٠ |
| `referral_unique_idx` | YES | `referrer_id`, `referrer_type`, `referred_id`, `referred_type` | ٠ |

### `user_analytics` (Class E) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `analytics_event_idx` | NO | `event` | ٠ |
| `analytics_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `user_contacts` (Class A) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `contacts_name_idx` | NO | `name` | ٠ |
| `contacts_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `user_correction_rules` (Class F) — 3 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `ucr_user_active_idx` | NO | `user_id`, `user_type`, `is_active` | ٠ |
| `ucr_user_pattern_uq` | YES | `user_id`, `user_type`, `pattern` | ٠ |

### `user_dictionaries` (Class F) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `user_dict_word_unique` | YES | `user_id`, `user_type`, `word` | ٠ |

### `discount_codes` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `discount_codes_code_unique` | YES | `code` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `expense_daily_rollups` (Class C) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `expense_daily_rollups_day_idx` | NO | `day` | ٣ |
| `expense_daily_rollups_user_day_idx` | YES | `user_id`, `user_type`, `business_id`, `day` | ٣ |

### `monthly_reports` (Class C) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `reports_user_month_unique` | YES | `user_id`, `user_type`, `month` | ٠ |

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

### `seo_pages` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `seo_pages_path_unique` | YES | `path` | ٠ |

### `user_credentials` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `credentials_user_idx` | NO | `user_id`, `user_type` | ٠ |
| `PRIMARY` | YES | `id` | ٠ |

### `user_profiles` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `profile_user_idx` | YES | `user_id`, `user_type` | ٠ |

### `user_wallets` (Class A) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `wallets_user_idx` | NO | `user_id`, `user_type` | ٠ |

### `voice_usage` (Class E) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `voice_user_month_idx` | NO | `user_id`, `user_type`, `month` | ٠ |

### `whatsapp_otp_codes` (Class D) — 2 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |
| `whatsapp_otp_phone_idx` | NO | `phone` | ٠ |

### `ads` (Class A) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |

### `ad_clicks` (Class E) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |

### `ad_stats_daily` (Class C) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ad_stats_daily_idx` | YES | `ad_id`, `day` | ٠ |

### `ai_cost_monthly` (Class C) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `ai_cost_monthly_idx` | YES | `user_id`, `user_type`, `billing_period`, `provider_slug`, `model_id` | ٠ |

### `auth_challenges` (Class D) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |

### `expense_categories` (Class A) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |

### `expense_details` (Class B) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `expense_id` | ٢٤ |

### `notification_templates` (Class A) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `id` | ٠ |

### `system_settings` (Class A) — 1 index(es)

| Index Name | Unique | Columns | Cardinality |
| :--- | :---: | :--- | ---: |
| `PRIMARY` | YES | `key` | ١٩ |

