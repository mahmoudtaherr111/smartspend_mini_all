CREATE TABLE `commitment_hints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`cashflow_id` int NOT NULL,
	`kind` varchar(12) NOT NULL,
	`value` varchar(160) NOT NULL,
	`weight` int NOT NULL DEFAULT 1,
	`last_seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `commitment_hints_id` PRIMARY KEY(`id`),
	CONSTRAINT `commitment_hints_value_unique` UNIQUE(`cashflow_id`,`kind`,`value`)
);
--> statement-breakpoint
CREATE TABLE `commitment_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`cashflow_id` int NOT NULL,
	`due_day` date NOT NULL,
	`action` varchar(10) NOT NULL,
	`new_day` date,
	`amount` decimal(12,2),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `commitment_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `commitment_overrides_day_unique` UNIQUE(`cashflow_id`,`due_day`)
);
--> statement-breakpoint
CREATE TABLE `commitment_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`kind` varchar(12) NOT NULL,
	`dedupe_key` varchar(80) NOT NULL,
	`cashflow_id` int,
	`due_day` date,
	`expense_id` int,
	`candidates` json,
	`status` varchar(12) NOT NULL DEFAULT 'open',
	`answer` varchar(40),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`answered_at` datetime,
	CONSTRAINT `commitment_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `commitment_questions_once` UNIQUE(`user_id`,`user_type`,`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `commitment_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`cashflow_id` int NOT NULL,
	`due_day` date NOT NULL,
	`stage` varchar(10) NOT NULL,
	`channel` varchar(10) NOT NULL,
	`sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `commitment_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `commitment_reminders_once` UNIQUE(`cashflow_id`,`due_day`,`stage`,`channel`)
);
--> statement-breakpoint
CREATE TABLE `commitment_schedule_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`cashflow_id` int NOT NULL,
	`due_day` date NOT NULL,
	`amount` decimal(12,2),
	`label` varchar(80),
	CONSTRAINT `commitment_schedule_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `commitment_schedule_items_day_unique` UNIQUE(`cashflow_id`,`due_day`)
);
--> statement-breakpoint
ALTER TABLE `cashflow_settlements` ADD `matched_by` varchar(12) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `installment_plans` ADD `cashflow_id` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `shape` varchar(12);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `provider` varchar(80);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `catalog_slug` varchar(60);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `beneficiary_contact_id` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `interval_count` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `occurrence_count` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `paid_before_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `total_amount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `amount_varies` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `payment_method` varchar(20);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `gam3eya_turn` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `parent_id` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `category` varchar(100);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `sub_category` varchar(100);--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `origin_expense_id` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `remind_days_before` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `remind_hour` int;--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD `reminders_enabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_catalog` ADD `brand_color` varchar(9);--> statement-breakpoint
ALTER TABLE `subscription_catalog` ADD `logo_url` varchar(300);--> statement-breakpoint
CREATE INDEX `commitment_hints_user_idx` ON `commitment_hints` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `commitment_overrides_user_idx` ON `commitment_overrides` (`user_id`,`user_type`,`cashflow_id`);--> statement-breakpoint
CREATE INDEX `commitment_questions_user_idx` ON `commitment_questions` (`user_id`,`user_type`,`status`);--> statement-breakpoint
CREATE INDEX `commitment_reminders_user_idx` ON `commitment_reminders` (`user_id`,`user_type`,`sent_at`);--> statement-breakpoint
CREATE INDEX `commitment_schedule_items_user_idx` ON `commitment_schedule_items` (`user_id`,`user_type`,`cashflow_id`);