CREATE TABLE `capture_markers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`value` varchar(120) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `capture_markers_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_markers_user_value_idx` UNIQUE(`user_id`,`user_type`,`kind`,`value`)
);
--> statement-breakpoint
ALTER TABLE `capture_usage` ADD `signal_day` varchar(10);--> statement-breakpoint
ALTER TABLE `capture_usage` ADD `signals` int DEFAULT 0 NOT NULL;