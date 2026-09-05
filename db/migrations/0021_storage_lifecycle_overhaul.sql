-- ==============================================================================
-- Migration: 0021_storage_lifecycle_overhaul.sql
-- Description:
--   1. Sessions: Add token_hash BINARY(32) and unique index for fast, secure lookup.
--   2. Expenses: Add covering composite index (user_id, user_type, business_id, date, type, category, sub_category, amount).
--   3. Tables: Create expense_details, expense_daily_rollups, ai_cost_monthly, ad_stats_daily.
--   4. Backfill:
--      - Hash existing active session tokens into token_hash.
--      - Seed expense_details with existing rawText and parsedMetadata.
--      - Aggregate historical expenses into expense_daily_rollups.
--
-- Reversibility: REVERSIBLE
-- Rollback Procedure:
--   - DROP TABLE IF EXISTS ad_stats_daily, ai_cost_monthly, expense_daily_rollups, expense_details;
--   - ALTER TABLE expenses DROP INDEX expenses_covering_rollup_idx;
--   - ALTER TABLE sessions DROP INDEX sessions_token_hash_idx, DROP COLUMN token_hash;
--
-- Lock behavior & performance:
--   - ALTER TABLE sessions & expenses will acquire metadata lock briefly in MySQL 8.
--   - Backfills are executed safely without long transaction lockups.
-- ==============================================================================

-- 1. Alter sessions: Add token_hash column and unique index
ALTER TABLE `sessions` ADD `token_hash` binary(32);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_idx` ON `sessions` (`token_hash`);
--> statement-breakpoint

-- 2. Alter expenses: Add covering rollup composite index (§3.3)
CREATE INDEX `expenses_covering_rollup_idx` ON `expenses` (
  `user_id`,
  `user_type`,
  `business_id`,
  `date`,
  `type`,
  `category`,
  `sub_category`,
  `amount`
);
--> statement-breakpoint

-- 3. Create expense_details (Hot Table Diet Side-Table - §3.9)
CREATE TABLE IF NOT EXISTS `expense_details` (
  `expense_id` int NOT NULL,
  `raw_text` text,
  `parsed_metadata` json,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `expense_details_expense_id` PRIMARY KEY(`expense_id`)
);
--> statement-breakpoint

-- 4. Create expense_daily_rollups (Day-grain Aggregates - §3.2)
CREATE TABLE IF NOT EXISTS `expense_daily_rollups` (
  `user_id` int NOT NULL,
  `user_type` varchar(50) NOT NULL,
  `business_id` int NOT NULL DEFAULT 0,
  `day` date NOT NULL,
  `income` decimal(14,2) NOT NULL DEFAULT 0.00,
  `expense` decimal(14,2) NOT NULL DEFAULT 0.00,
  `transfer` decimal(14,2) NOT NULL DEFAULT 0.00,
  `investment` decimal(14,2) NOT NULL DEFAULT 0.00,
  `automated_income` decimal(14,2) NOT NULL DEFAULT 0.00,
  `automated_expense` decimal(14,2) NOT NULL DEFAULT 0.00,
  `txn_count` int NOT NULL DEFAULT 0,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `expense_daily_rollups_user_day_idx` UNIQUE(`user_id`, `user_type`, `business_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `expense_daily_rollups_day_idx` ON `expense_daily_rollups` (`day`);
--> statement-breakpoint

-- 5. Create ai_cost_monthly (AI Token & Cost Rollup - §3.7)
CREATE TABLE IF NOT EXISTS `ai_cost_monthly` (
  `user_id` int NOT NULL,
  `user_type` varchar(50) NOT NULL,
  `billing_period` varchar(7) NOT NULL,
  `provider_slug` varchar(50) NOT NULL,
  `model_id` varchar(200) NOT NULL,
  `total_tokens` int NOT NULL DEFAULT 0,
  `prompt_tokens` int NOT NULL DEFAULT 0,
  `completion_tokens` int NOT NULL DEFAULT 0,
  `cost_usd` decimal(12,8) NOT NULL DEFAULT 0.00000000,
  `cost_egp` decimal(12,6) NOT NULL DEFAULT 0.000000,
  `call_count` int NOT NULL DEFAULT 0,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ai_cost_monthly_idx` UNIQUE(`user_id`, `user_type`, `billing_period`, `provider_slug`, `model_id`)
);
--> statement-breakpoint

-- 6. Create ad_stats_daily (Ad Clicks & Impressions Rollup - §3.7)
CREATE TABLE IF NOT EXISTS `ad_stats_daily` (
  `ad_id` int NOT NULL,
  `day` date NOT NULL,
  `clicks` int NOT NULL DEFAULT 0,
  `impressions` int NOT NULL DEFAULT 0,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ad_stats_daily_idx` UNIQUE(`ad_id`, `day`)
);
--> statement-breakpoint

-- 7. Backfill active session token_hashes from plaintext tokens
UPDATE `sessions`
SET `token_hash` = UNHEX(SHA2(`token`, 256))
WHERE `token` IS NOT NULL AND `token_hash` IS NULL;
--> statement-breakpoint

-- 8. Backfill expense_details from existing expenses
INSERT IGNORE INTO `expense_details` (`expense_id`, `raw_text`, `parsed_metadata`, `created_at`)
SELECT `id`, `raw_text`, `parsed_metadata`, `created_at`
FROM `expenses`
WHERE `raw_text` IS NOT NULL OR `parsed_metadata` IS NOT NULL;
--> statement-breakpoint

-- 9. Backfill expense_daily_rollups from historical expenses
INSERT INTO `expense_daily_rollups` (
  `user_id`,
  `user_type`,
  `business_id`,
  `day`,
  `income`,
  `expense`,
  `transfer`,
  `investment`,
  `automated_income`,
  `automated_expense`,
  `txn_count`
)
SELECT
  `user_id`,
  `user_type`,
  COALESCE(`business_id`, 0) AS `business_id`,
  DATE(`date`) AS `day`,
  COALESCE(SUM(CASE WHEN `type` = 'income' THEN `amount` ELSE 0 END), 0.00) AS `income`,
  COALESCE(SUM(CASE WHEN `type` = 'expense' THEN `amount` ELSE 0 END), 0.00) AS `expense`,
  COALESCE(SUM(CASE WHEN `type` = 'transfer' THEN `amount` ELSE 0 END), 0.00) AS `transfer`,
  COALESCE(SUM(CASE WHEN `type` = 'investment' THEN `amount` ELSE 0 END), 0.00) AS `investment`,
  COALESCE(SUM(CASE WHEN `type` = 'income' AND `source` = 'sms' THEN `amount` ELSE 0 END), 0.00) AS `automated_income`,
  COALESCE(SUM(CASE WHEN `type` = 'expense' AND `source` = 'sms' THEN `amount` ELSE 0 END), 0.00) AS `automated_expense`,
  COUNT(*) AS `txn_count`
FROM `expenses`
WHERE `status` = 'confirmed'
GROUP BY `user_id`, `user_type`, COALESCE(`business_id`, 0), DATE(`date`)
ON DUPLICATE KEY UPDATE
  `income` = VALUES(`income`),
  `expense` = VALUES(`expense`),
  `transfer` = VALUES(`transfer`),
  `investment` = VALUES(`investment`),
  `automated_income` = VALUES(`automated_income`),
  `automated_expense` = VALUES(`automated_expense`),
  `txn_count` = VALUES(`txn_count`);
