CREATE TABLE `capture_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'review',
	`kind` varchar(32) NOT NULL,
	`direction` varchar(10),
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`amount_egp` decimal(14,2),
	`occurred_at` datetime NOT NULL,
	`first_received_at` datetime NOT NULL,
	`card_suffix` varchar(4),
	`account_suffix` varchar(8),
	`merchant_key` varchar(120),
	`reference_hmac` varchar(64),
	`balance_after` decimal(14,2),
	`own_account` boolean NOT NULL DEFAULT false,
	`channels` json NOT NULL,
	`primary_signal_id` int NOT NULL,
	`possible_duplicate_of` int,
	`linked_event_id` int,
	`wallet_id` int,
	`expense_id` int,
	`device_id` int NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`resolved_at` datetime,
	CONSTRAINT `capture_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `capture_signals` ADD `event_id` int;--> statement-breakpoint
ALTER TABLE `capture_signals` ADD `text_hmac` varchar(64) NOT NULL;--> statement-breakpoint
CREATE INDEX `capture_events_user_status_idx` ON `capture_events` (`user_id`,`user_type`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `capture_events_user_received_idx` ON `capture_events` (`user_id`,`user_type`,`first_received_at`);--> statement-breakpoint
CREATE INDEX `capture_events_user_reference_idx` ON `capture_events` (`user_id`,`user_type`,`reference_hmac`);--> statement-breakpoint
CREATE INDEX `capture_events_created_idx` ON `capture_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `capture_signals_user_text_idx` ON `capture_signals` (`user_id`,`user_type`,`text_hmac`,`received_at`);--> statement-breakpoint
CREATE INDEX `capture_signals_event_idx` ON `capture_signals` (`event_id`);