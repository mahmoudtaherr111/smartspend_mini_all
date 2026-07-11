ALTER TABLE `expenses` ADD `contact_id` int;
--> statement-breakpoint
ALTER TABLE `expenses` ADD `classification_log_id` int;
--> statement-breakpoint
CREATE INDEX `expenses_contact_idx` ON `expenses` (`contact_id`);
--> statement-breakpoint
CREATE INDEX `expenses_classification_log_idx` ON `expenses` (`classification_log_id`);
