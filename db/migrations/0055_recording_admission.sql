CREATE TABLE `recording_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`day` varchar(10) NOT NULL,
	`month` varchar(7) NOT NULL,
	`attempt` int NOT NULL DEFAULT 1,
	`status` varchar(16) NOT NULL,
	`charged_tokens` int NOT NULL DEFAULT 0,
	`reserved_tokens` int NOT NULL DEFAULT 0,
	`lease_until` datetime NOT NULL,
	`classification_log_id` int,
	`reply` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `recording_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `recording_requests_owner_key` UNIQUE(`user_id`,`user_type`,`request_key`)
);
--> statement-breakpoint
CREATE INDEX `recording_requests_owner_month` ON `recording_requests` (`user_id`,`user_type`,`month`,`day`);--> statement-breakpoint
CREATE INDEX `recording_requests_created` ON `recording_requests` (`created_at`);