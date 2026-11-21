CREATE TABLE `capture_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`memory_key` varchar(140) NOT NULL,
	`category_id` varchar(60) NOT NULL,
	`sub_category_id` varchar(60) NOT NULL,
	`uses` int NOT NULL DEFAULT 1,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capture_memory_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_memory_user_key_idx` UNIQUE(`user_id`,`user_type`,`memory_key`)
);
--> statement-breakpoint
CREATE TABLE `capture_user_pairs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`source_slug` varchar(64) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`streak` int NOT NULL DEFAULT 0,
	`auto_enabled` boolean NOT NULL DEFAULT false,
	`asked_at` datetime,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capture_user_pairs_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_user_pairs_user_pair_idx` UNIQUE(`user_id`,`user_type`,`source_slug`,`kind`)
);
--> statement-breakpoint
ALTER TABLE `capture_events` ADD `auto_recorded` boolean DEFAULT false NOT NULL;