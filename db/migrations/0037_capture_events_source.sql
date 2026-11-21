ALTER TABLE `capture_events` ADD `source_slug` varchar(64);--> statement-breakpoint
ALTER TABLE `capture_events` ADD `reader_version` varchar(32);--> statement-breakpoint
CREATE INDEX `capture_events_source_created_idx` ON `capture_events` (`source_slug`,`created_at`);