CREATE TABLE `capture_ai_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`device_id` int NOT NULL,
	`signal_id` int NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`next_at` datetime NOT NULL,
	`lease_until` datetime,
	`outcome` varchar(32),
	`event_id` int,
	`lang` varchar(2) NOT NULL DEFAULT 'ar',
	`notice` json,
	`notice_delivered_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_ai_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_ai_jobs_signal_idx` UNIQUE(`signal_id`)
);
--> statement-breakpoint
CREATE INDEX `capture_ai_jobs_due_idx` ON `capture_ai_jobs` (`status`,`next_at`);--> statement-breakpoint
CREATE INDEX `capture_ai_jobs_user_device_idx` ON `capture_ai_jobs` (`user_id`,`user_type`,`device_id`,`notice_delivered_at`);--> statement-breakpoint
CREATE INDEX `capture_ai_jobs_created_idx` ON `capture_ai_jobs` (`created_at`);