CREATE TABLE `classification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`original_text` text NOT NULL,
	`normalized_text` text,
	`parsed_by` varchar(50) NOT NULL,
	`rule_engine_result` json,
	`ai_result` json,
	`final_result` json,
	`confidence` int DEFAULT 0,
	`decision` varchar(50),
	`classification_version` varchar(20) DEFAULT 'v2.1',
	`reasoning_trace_light` json,
	`ambiguity_flags` json,
	`input_channel` varchar(20) DEFAULT 'text',
	`needs_followup` boolean DEFAULT false,
	`was_corrected` boolean DEFAULT false,
	`correction` json,
	`model_used` varchar(100),
	`tokens_used` int DEFAULT 0,
	`processing_time_ms` int DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `classification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_behavior_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`month` varchar(7) NOT NULL,
	`total_income` decimal(12,2) DEFAULT '0.00',
	`total_expense` decimal(12,2) DEFAULT '0.00',
	`net_flow` decimal(12,2) DEFAULT '0.00',
	`top_categories` json,
	`top_sub_categories` json,
	`spending_by_day` json,
	`spending_by_weekday` json,
	`behavior_flags` json,
	`inferred_attributes` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_behavior_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `behavior_snapshot_user_month_idx` UNIQUE(`user_id`,`user_type`,`month`)
);
--> statement-breakpoint
CREATE TABLE `profile_learning_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`source` varchar(100) NOT NULL DEFAULT 'backend',
	`previous_attributes` json,
	`new_attributes` json,
	`metadata` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `profile_learning_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `raw_sms_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`message` text NOT NULL,
	`sender` varchar(100),
	`sms_timestamp` varchar(100),
	`status` varchar(50) DEFAULT 'pending',
	`metadata` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `raw_sms_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`duration_seconds` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`source` varchar(50) DEFAULT 'gemini_stt',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `voice_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`token` varchar(255) NOT NULL,
	`name` varchar(100) DEFAULT 'Default Token',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `payment_method` varchar(50);--> statement-breakpoint
ALTER TABLE `expenses` ADD `place_hint` varchar(150);--> statement-breakpoint
ALTER TABLE `expenses` ADD `parsed_metadata` json;--> statement-breakpoint
ALTER TABLE `local_users` ADD `avatar` varchar(500);--> statement-breakpoint
ALTER TABLE `local_users` ADD `current_streak` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `local_users` ADD `highest_streak` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `local_users` ADD `last_streak_at` datetime;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `basic_info` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `financial_info` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `lifestyle_info` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `onboarding_answers` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `ai_inferred_attributes` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `preferences` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `avatar_id` varchar(100);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `profile_version` int DEFAULT 2;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `last_ai_refresh_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `current_streak` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `highest_streak` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `last_streak_at` datetime;--> statement-breakpoint
CREATE INDEX `cls_log_user_idx` ON `classification_logs` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `cls_log_parsed_idx` ON `classification_logs` (`parsed_by`);--> statement-breakpoint
CREATE INDEX `cls_log_date_idx` ON `classification_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `behavior_snapshot_month_idx` ON `monthly_behavior_snapshots` (`month`);--> statement-breakpoint
CREATE INDEX `profile_learning_user_idx` ON `profile_learning_events` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `profile_learning_event_idx` ON `profile_learning_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `raw_sms_user_idx` ON `raw_sms_events` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `raw_sms_status_idx` ON `raw_sms_events` (`status`);--> statement-breakpoint
CREATE INDEX `voice_user_month_idx` ON `voice_usage` (`user_id`,`user_type`,`month`);--> statement-breakpoint
CREATE INDEX `webhook_tokens_user_idx` ON `webhook_tokens` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `webhook_tokens_token_idx` ON `webhook_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `expenses_user_date_idx` ON `expenses` (`user_id`,`user_type`,`date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category`);