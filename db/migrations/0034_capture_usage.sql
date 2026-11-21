CREATE TABLE `capture_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`period` varchar(7) NOT NULL,
	`reserved` int NOT NULL DEFAULT 0,
	`held` int NOT NULL DEFAULT 0,
	`limit_noticed` boolean NOT NULL DEFAULT false,
	`question_day` varchar(10),
	`questions` int NOT NULL DEFAULT 0,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capture_usage_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_usage_user_period_idx` UNIQUE(`user_id`,`user_type`,`period`)
);
--> statement-breakpoint
ALTER TABLE `capture_events` ADD `reading` json;--> statement-breakpoint
ALTER TABLE `capture_events` ADD `quota_period` varchar(7);