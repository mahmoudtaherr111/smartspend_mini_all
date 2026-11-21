ALTER TABLE `capture_devices` ADD `last_heartbeat_at` datetime;--> statement-breakpoint
ALTER TABLE `capture_devices` ADD `health` json;--> statement-breakpoint
ALTER TABLE `capture_devices` ADD `silent_notice_at` datetime;