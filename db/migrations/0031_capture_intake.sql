CREATE TABLE `capture_consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`scope` varchar(20) NOT NULL,
	`text_version` varchar(20) NOT NULL,
	`granted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`revoked_at` datetime,
	CONSTRAINT `capture_consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `capture_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`platform` varchar(10) NOT NULL,
	`installation_id` varchar(64) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`label` varchar(80),
	`app_version` varchar(32),
	`os_version` varchar(32),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_seen_at` datetime,
	`last_signal_at` datetime,
	`revoked_at` datetime,
	CONSTRAINT `capture_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_devices_token_idx` UNIQUE(`token_hash`),
	CONSTRAINT `capture_devices_installation_idx` UNIQUE(`user_id`,`user_type`,`installation_id`)
);
--> statement-breakpoint
CREATE TABLE `capture_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`device_id` int NOT NULL,
	`client_signal_id` varchar(64) NOT NULL,
	`channel` varchar(16) NOT NULL,
	`source_slug` varchar(64),
	`text_redacted` text,
	`reading` json NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'review',
	`expense_id` int,
	`received_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`resolved_at` datetime,
	CONSTRAINT `capture_signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_signals_client_idx` UNIQUE(`user_id`,`user_type`,`client_signal_id`)
);
--> statement-breakpoint
CREATE INDEX `capture_consents_user_scope_idx` ON `capture_consents` (`user_id`,`user_type`,`scope`);--> statement-breakpoint
CREATE INDEX `capture_devices_user_idx` ON `capture_devices` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `capture_signals_user_status_idx` ON `capture_signals` (`user_id`,`user_type`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `capture_signals_created_idx` ON `capture_signals` (`created_at`);