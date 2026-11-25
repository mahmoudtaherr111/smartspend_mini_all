ALTER TABLE `expenses` ADD `purpose_category_id` varchar(64);--> statement-breakpoint
ALTER TABLE `expenses` ADD `purpose_sub_id` varchar(64);--> statement-breakpoint
ALTER TABLE `expenses` ADD `purpose_version` varchar(16);--> statement-breakpoint
CREATE INDEX `expenses_owner_purpose_idx` ON `expenses` (`user_id`,`user_type`,`purpose_category_id`,`date`);