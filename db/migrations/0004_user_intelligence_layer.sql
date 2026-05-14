ALTER TABLE `user_profiles` ADD `basic_info` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `financial_info` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `lifestyle_info` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `onboarding_answers` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `ai_inferred_attributes` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `preferences` json;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `avatar_id` varchar(100);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `profile_version` int DEFAULT 2;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `last_ai_refresh_at` datetime;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `profile_learning_events` (
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
);--> statement-breakpoint
CREATE INDEX `profile_learning_user_idx` ON `profile_learning_events` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `profile_learning_event_idx` ON `profile_learning_events` (`event_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monthly_behavior_snapshots` (
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
);--> statement-breakpoint
CREATE INDEX `behavior_snapshot_month_idx` ON `monthly_behavior_snapshots` (`month`);
