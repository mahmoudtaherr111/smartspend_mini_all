CREATE TABLE `capture_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`event_id` int NOT NULL,
	`expense_id` int NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`expected_category` varchar(100) NOT NULL,
	`expected_sub_category` varchar(100) NOT NULL,
	`shown_day` varchar(10),
	`shown_at` datetime,
	`resolved_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_questions_owner_event_idx` UNIQUE(`user_id`,`user_type`,`event_id`)
);
--> statement-breakpoint
CREATE INDEX `capture_questions_owner_status_idx` ON `capture_questions` (`user_id`,`user_type`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `capture_questions_owner_day_idx` ON `capture_questions` (`user_id`,`user_type`,`shown_day`);--> statement-breakpoint
CREATE INDEX `capture_questions_created_idx` ON `capture_questions` (`created_at`);