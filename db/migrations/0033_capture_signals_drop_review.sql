DROP INDEX `capture_signals_user_status_idx` ON `capture_signals`;--> statement-breakpoint
ALTER TABLE `capture_signals` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `capture_signals` DROP COLUMN `expense_id`;--> statement-breakpoint
ALTER TABLE `capture_signals` DROP COLUMN `resolved_at`;