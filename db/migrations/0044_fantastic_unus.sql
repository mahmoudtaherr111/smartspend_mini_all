CREATE TABLE `capture_ai_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`period` varchar(7) NOT NULL,
	`tokens` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_ai_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_ai_accounts_owner_period` UNIQUE(`user_id`,`user_type`,`period`)
);
--> statement-breakpoint
CREATE TABLE `capture_ai_days` (
	`day` varchar(10) NOT NULL,
	`cost_usd` decimal(16,8) NOT NULL DEFAULT '0',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_ai_days_day` PRIMARY KEY(`day`)
);
--> statement-breakpoint
CREATE TABLE `capture_ai_reservations` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`day` varchar(10) NOT NULL,
	`period` varchar(7) NOT NULL,
	`tokens` int NOT NULL,
	`cost_usd` decimal(16,8) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'reserved',
	`lease_until` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_ai_reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `capture_ai_reservations_owner` ON `capture_ai_reservations` (`user_id`,`user_type`,`period`);--> statement-breakpoint
CREATE INDEX `capture_ai_reservations_leases` ON `capture_ai_reservations` (`status`,`lease_until`);