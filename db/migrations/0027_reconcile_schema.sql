-- ==============================================================================
-- Migration: 0027_reconcile_schema.sql
--
-- Brings a database to what db/schema.ts declares, whichever way it was built. Until now
-- the migrations did not build the schema: a database created from them stopped at 0021
-- (it indexes expenses.business_id, which no migration adds) and lacked the business
-- tables and columns, the contact columns, auto_renew, the unique indexes on the Paymob
-- transaction id and on users.email, and the session columns the sign-in code writes
-- (0021 made token_hash binary(32) and left token NOT NULL, while the code stores a hex
-- hash and no token). Databases made with drizzle-kit push already have all of it.
--
-- Every statement checks information_schema first, so on a database that already
-- matches the schema this migration changes nothing. `npm run db:doctor` compares a
-- database with db/schema.ts and names anything still different.
--
-- Written by hand: drizzle-kit only diffs snapshots, and the 0026 snapshot already
-- records these objects. The 0027 snapshot is the 0026 one.
--
-- Can fail on: duplicate non-null values in pro_subscriptions.transaction_id or
-- users.email, which the new unique indexes refuse. Nothing is dropped except the
-- sessions_token_idx index on the plaintext token column the code no longer fills.
-- ==============================================================================

-- 1. Businesses (business mode): tables no migration created.
CREATE TABLE IF NOT EXISTS `user_businesses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`type_label` varchar(255),
	`description` text,
	`keywords` json,
	`is_active` boolean DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_businesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_businesses' AND index_name = 'business_user_idx') = 0, 'CREATE INDEX `business_user_idx` ON `user_businesses` (`user_id`,`user_type`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_businesses' AND index_name = 'business_active_idx') = 0, 'CREATE INDEX `business_active_idx` ON `user_businesses` (`is_active`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `business_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`business_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_ar` varchar(100) NOT NULL,
	`icon` varchar(50) DEFAULT '🛍️',
	`color` varchar(50) DEFAULT '#3b82f6',
	`type` varchar(20) NOT NULL DEFAULT 'expense',
	`keywords` json,
	`match_examples` json,
	`is_auto_generated` boolean DEFAULT true,
	`is_active` boolean DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'business_categories' AND index_name = 'business_cat_active_idx') = 0, 'CREATE INDEX `business_cat_active_idx` ON `business_categories` (`business_id`,`is_active`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
-- 2. Expenses: the business an entry belongs to.
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'expenses' AND column_name = 'business_id') = 0, 'ALTER TABLE `expenses` ADD `business_id` int', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'expenses' AND index_name = 'expenses_business_idx') = 0, 'CREATE INDEX `expenses_business_idx` ON `expenses` (`business_id`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'expenses' AND index_name = 'expenses_covering_rollup_idx') = 0, 'CREATE INDEX `expenses_covering_rollup_idx` ON `expenses` (`user_id`,`user_type`,`business_id`,`date`,`type`,`category`,`sub_category`,`amount`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
-- 3. Contacts: kind, business, silencing and the running count.
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'contact_type') = 0, 'ALTER TABLE `user_contacts` ADD `contact_type` varchar(30) NOT NULL DEFAULT ''personal''', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'business_id') = 0, 'ALTER TABLE `user_contacts` ADD `business_id` int', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'is_silenced') = 0, 'ALTER TABLE `user_contacts` ADD `is_silenced` boolean DEFAULT false', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'transaction_count') = 0, 'ALTER TABLE `user_contacts` ADD `transaction_count` int DEFAULT 0', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'updated_at') = 0, 'ALTER TABLE `user_contacts` ADD `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND index_name = 'contacts_type_idx') = 0, 'CREATE INDEX `contacts_type_idx` ON `user_contacts` (`contact_type`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND index_name = 'contacts_business_idx') = 0, 'CREATE INDEX `contacts_business_idx` ON `user_contacts` (`business_id`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND index_name = 'contacts_silenced_idx') = 0, 'CREATE INDEX `contacts_silenced_idx` ON `user_contacts` (`is_silenced`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
-- 4. Subscriptions: renewal flag, and one row per Paymob transaction.
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pro_subscriptions' AND column_name = 'auto_renew') = 0, 'ALTER TABLE `pro_subscriptions` ADD `auto_renew` boolean NOT NULL DEFAULT true', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'pro_subscriptions' AND index_name = 'pro_sub_transaction_unique_idx') = 0, 'CREATE UNIQUE INDEX `pro_sub_transaction_unique_idx` ON `pro_subscriptions` (`transaction_id`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
-- 5. Smaller columns and indexes.
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_conversations' AND column_name = 'metadata') = 0, 'ALTER TABLE `chat_conversations` ADD `metadata` json', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_pending_actions' AND column_name = 'idempotency_key') = 0, 'ALTER TABLE `ai_pending_actions` ADD `idempotency_key` varchar(255)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ai_pending_actions' AND index_name = 'ai_pending_action_idempotency_idx') = 0, 'CREATE INDEX `ai_pending_action_idempotency_idx` ON `ai_pending_actions` (`idempotency_key`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_email_unique') = 0, 'CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
-- 6. Sessions: the hex token hash the code writes, and no plaintext token.
--    A binary(32) hash from 0021 becomes the same hash in hex, so sessions survive.
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'token_hash' AND data_type = 'binary') = 1, 'ALTER TABLE `sessions` MODIFY `token_hash` varbinary(64)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'token_hash' AND data_type = 'varbinary') = 1, 'UPDATE `sessions` SET `token_hash` = LOWER(HEX(`token_hash`)) WHERE `token_hash` IS NOT NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'token_hash' AND data_type = 'varbinary') = 1, 'ALTER TABLE `sessions` MODIFY `token_hash` varchar(64)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'token' AND is_nullable = 'NO') = 1, 'ALTER TABLE `sessions` MODIFY `token` varchar(500)', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'sessions' AND index_name = 'sessions_token_idx') > 0, 'DROP INDEX `sessions_token_idx` ON `sessions`', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
-- 7. created_at is NOT NULL in the schema; the early migrations left it nullable.
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ad_clicks' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ad_clicks` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ad_clicks' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ad_clicks` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ads' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ads` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ads' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ads` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_action_audit_logs' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_action_audit_logs` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_action_audit_logs' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_action_audit_logs` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_action_memory' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_action_memory` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_action_memory' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_action_memory` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_conversation_summaries' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_conversation_summaries` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_conversation_summaries' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_conversation_summaries` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_memory_embeddings' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_memory_embeddings` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_memory_embeddings' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_memory_embeddings` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_memory_items' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_memory_items` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_memory_items' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_memory_items` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_pending_actions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_pending_actions` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_pending_actions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_pending_actions` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_summaries' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `ai_summaries` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_summaries' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `ai_summaries` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'api_key_errors' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `api_key_errors` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'api_key_errors' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `api_key_errors` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_conversations' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `chat_conversations` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_conversations' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `chat_conversations` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `chat_messages` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `chat_messages` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'classification_logs' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `classification_logs` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'classification_logs' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `classification_logs` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'discount_codes' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `discount_codes` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'discount_codes' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `discount_codes` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'expense_categories' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `expense_categories` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'expense_categories' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `expense_categories` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'expenses' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `expenses` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'expenses' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `expenses` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'financial_goals' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `financial_goals` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'financial_goals' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `financial_goals` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'in_app_notifications' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `in_app_notifications` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'in_app_notifications' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `in_app_notifications` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'local_users' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `local_users` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'local_users' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `local_users` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'monthly_behavior_snapshots' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `monthly_behavior_snapshots` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'monthly_behavior_snapshots' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `monthly_behavior_snapshots` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'monthly_reports' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `monthly_reports` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'monthly_reports' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `monthly_reports` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_templates' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `notification_templates` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_templates' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `notification_templates` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'onboarding_questions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `onboarding_questions` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'onboarding_questions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `onboarding_questions` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pending_clarifications' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `pending_clarifications` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pending_clarifications' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `pending_clarifications` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pro_subscriptions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `pro_subscriptions` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pro_subscriptions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `pro_subscriptions` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'profile_learning_events' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `profile_learning_events` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'profile_learning_events' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `profile_learning_events` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'push_subscriptions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `push_subscriptions` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'push_subscriptions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `push_subscriptions` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'raw_sms_events' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `raw_sms_events` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'raw_sms_events' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `raw_sms_events` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `referrals` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'referrals' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `referrals` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `sessions` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `sessions` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'support_tickets' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `support_tickets` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'support_tickets' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `support_tickets` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_analytics' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_analytics` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_analytics' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_analytics` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_budgets' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_budgets` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_budgets' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_budgets` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_contacts` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_contacts' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_contacts` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_credentials' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_credentials` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_credentials' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_credentials` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_dictionaries' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_dictionaries` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_dictionaries' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_dictionaries` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_profiles' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_profiles` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_profiles' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_profiles` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_wallets' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `user_wallets` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_wallets' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `user_wallets` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `users` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `users` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voice_usage' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `voice_usage` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voice_usage' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `voice_usage` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'webhook_tokens' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'UPDATE `webhook_tokens` SET `created_at` = CURRENT_TIMESTAMP WHERE `created_at` IS NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
--> statement-breakpoint
SET @ss_0027 = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'webhook_tokens' AND column_name = 'created_at' AND is_nullable = 'YES') = 1, 'ALTER TABLE `webhook_tokens` MODIFY `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
--> statement-breakpoint
PREPARE ss_0027 FROM @ss_0027;
--> statement-breakpoint
EXECUTE ss_0027;
--> statement-breakpoint
DEALLOCATE PREPARE ss_0027;
