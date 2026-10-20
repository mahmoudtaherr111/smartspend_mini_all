CREATE TABLE `capture_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(60) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`name_ar` varchar(120) NOT NULL,
	`name_en` varchar(120) NOT NULL,
	`countries` json NOT NULL,
	`android_packages` json NOT NULL,
	`sender_ids` json NOT NULL,
	`aliases` json NOT NULL,
	`notes` text,
	`priority` int NOT NULL DEFAULT 100,
	`status` varchar(12) NOT NULL DEFAULT 'active',
	`origin` varchar(10) NOT NULL DEFAULT 'admin',
	`admin_edited_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capture_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_sources_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `subscription_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(60) NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_ar` varchar(100) NOT NULL,
	`kind` varchar(12) NOT NULL DEFAULT 'service',
	`match_tokens` json NOT NULL,
	`category_id` varchar(40) NOT NULL,
	`sub_category_id` varchar(40) NOT NULL,
	`cycle` varchar(12) NOT NULL DEFAULT 'monthly',
	`status` varchar(12) NOT NULL DEFAULT 'active',
	`origin` varchar(10) NOT NULL DEFAULT 'admin',
	`admin_edited_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_catalog_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `capture_sources_status_idx` ON `capture_sources` (`status`,`kind`);--> statement-breakpoint
CREATE INDEX `subscription_catalog_status_idx` ON `subscription_catalog` (`status`);