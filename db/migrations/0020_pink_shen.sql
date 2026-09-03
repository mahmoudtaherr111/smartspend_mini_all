CREATE TABLE `user_correction_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`pattern` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`sub_category` varchar(100) NOT NULL DEFAULT 'عام',
	`type` varchar(20) NOT NULL,
	`amount_min` decimal(12,2),
	`amount_max` decimal(12,2),
	`times_applied` int NOT NULL DEFAULT 0,
	`times_overridden` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`source_log_id` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_correction_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `ucr_user_pattern_uq` UNIQUE(`user_id`,`user_type`,`pattern`)
);
--> statement-breakpoint
CREATE INDEX `ucr_user_active_idx` ON `user_correction_rules` (`user_id`,`user_type`,`is_active`);