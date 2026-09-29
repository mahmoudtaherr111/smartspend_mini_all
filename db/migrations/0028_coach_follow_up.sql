CREATE TABLE `cashflow_settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`cashflow_id` int NOT NULL,
	`due_day` date NOT NULL,
	`expense_id` int,
	`amount` decimal(12,2) NOT NULL,
	`source` varchar(20) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `cashflow_settlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `cashflow_settlements_once` UNIQUE(`cashflow_id`,`due_day`,`expense_id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`business_id` int,
	`title` varchar(160) NOT NULL,
	`goal` varchar(300),
	`status` varchar(20) NOT NULL DEFAULT 'proposed',
	`revision` int NOT NULL DEFAULT 1,
	`review_day` date,
	`source` varchar(20) NOT NULL,
	`call_id` varchar(40),
	`evidence` json,
	`accepted_at` datetime,
	`ended_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plan_id` int NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`title` varchar(200) NOT NULL,
	`kind` varchar(30) NOT NULL DEFAULT 'other',
	`target` json,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`due_day` date,
	`done_at` datetime,
	`done_evidence` varchar(20),
	`remind_at` datetime,
	`reminder_status` varchar(20) NOT NULL DEFAULT 'none',
	`reminder_revision` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_cashflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`business_id` int,
	`kind` varchar(30) NOT NULL,
	`direction` varchar(10) NOT NULL,
	`title` varchar(120) NOT NULL,
	`amount` decimal(12,2),
	`recurrence` varchar(10) NOT NULL,
	`start_day` date,
	`end_day` date,
	`certainty` varchar(12) NOT NULL DEFAULT 'confirmed',
	`source` varchar(20) NOT NULL DEFAULT 'user',
	`installment_plan_id` int,
	`contact_id` int,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_cashflows_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_cashflows_plan_unique` UNIQUE(`user_id`,`user_type`,`installment_plan_id`)
);
--> statement-breakpoint
ALTER TABLE `user_wallets` ADD `balance_observed_at` datetime;--> statement-breakpoint
ALTER TABLE `user_wallets` ADD `balance_source` varchar(30);--> statement-breakpoint
CREATE INDEX `cashflow_settlements_user_idx` ON `cashflow_settlements` (`user_id`,`user_type`,`cashflow_id`,`due_day`);--> statement-breakpoint
CREATE INDEX `cashflow_settlements_expense_idx` ON `cashflow_settlements` (`expense_id`);--> statement-breakpoint
CREATE INDEX `coaching_plans_user_idx` ON `coaching_plans` (`user_id`,`user_type`,`status`);--> statement-breakpoint
CREATE INDEX `coaching_steps_plan_idx` ON `coaching_steps` (`plan_id`);--> statement-breakpoint
CREATE INDEX `coaching_steps_user_idx` ON `coaching_steps` (`user_id`,`user_type`,`status`);--> statement-breakpoint
CREATE INDEX `coaching_steps_reminder_idx` ON `coaching_steps` (`reminder_status`,`remind_at`);--> statement-breakpoint
CREATE INDEX `scheduled_cashflows_user_idx` ON `scheduled_cashflows` (`user_id`,`user_type`,`status`);