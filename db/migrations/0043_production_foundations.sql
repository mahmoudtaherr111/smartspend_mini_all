CREATE TABLE `ad_impressions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ad_id` int NOT NULL,
	`user_id` int,
	`user_type` varchar(50),
	`placement` varchar(100) NOT NULL,
	`impression_token` varchar(128) NOT NULL,
	`ip_address` varchar(100),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ad_impressions_id` PRIMARY KEY(`id`),
	CONSTRAINT `ad_impressions_token_idx` UNIQUE(`impression_token`)
);
--> statement-breakpoint
CREATE TABLE `admin_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admin_id` int NOT NULL,
	`admin_type` varchar(50) NOT NULL,
	`action` varchar(100) NOT NULL,
	`target_type` varchar(100) NOT NULL,
	`target_id` varchar(255) NOT NULL,
	`details` json,
	`ip_address` varchar(100),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `admin_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`store` varchar(50) NOT NULL,
	`event_id` varchar(191) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`purchase_key` varchar(255) NOT NULL,
	`event_time` datetime(3) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `store_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_events_event_idx` UNIQUE(`store`,`event_id`)
);
--> statement-breakpoint
CREATE TABLE `store_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`store` varchar(50) NOT NULL,
	`store_product_id` varchar(100) NOT NULL,
	`original_transaction_id` varchar(255) NOT NULL,
	`purchase_token` text NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`expires_at` datetime,
	`last_event_at` datetime(3),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_purchases_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_purchases_store_key_idx` UNIQUE(`store`,`original_transaction_id`)
);
--> statement-breakpoint
ALTER TABLE `ads` ADD `platform_target` varchar(50) DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `ads` ADD `frequency_cap_per_day` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `ad_impressions_user_idx` ON `ad_impressions` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `ad_impressions_ad_user_idx` ON `ad_impressions` (`ad_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_admin_idx` ON `admin_audit_logs` (`admin_id`,`admin_type`);--> statement-breakpoint
CREATE INDEX `admin_audit_action_idx` ON `admin_audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `admin_audit_target_idx` ON `admin_audit_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `store_events_created_idx` ON `store_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `store_purchases_user_idx` ON `store_purchases` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `store_purchases_expiry_idx` ON `store_purchases` (`status`,`expires_at`);