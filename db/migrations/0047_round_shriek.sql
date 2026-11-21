CREATE TABLE `capture_samples` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`signal_id` int NOT NULL,
	`event_id` int,
	`source_slug` varchar(64),
	`channel` varchar(16) NOT NULL,
	`text_redacted` text NOT NULL,
	`text_hmac` varchar(64) NOT NULL,
	`prompt_version` varchar(16) NOT NULL,
	`provider` varchar(64),
	`model` varchar(128),
	`model_reply` json,
	`posting` json,
	`received_month` varchar(7) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_samples_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_samples_signal_idx` UNIQUE(`signal_id`)
);
--> statement-breakpoint
CREATE INDEX `capture_samples_user_idx` ON `capture_samples` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `capture_samples_created_idx` ON `capture_samples` (`created_at`);