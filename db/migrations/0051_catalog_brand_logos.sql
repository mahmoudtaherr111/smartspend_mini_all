ALTER TABLE `subscription_catalog` ADD `app_package` varchar(160);--> statement-breakpoint
ALTER TABLE `subscription_catalog` ADD `website` varchar(160);--> statement-breakpoint
ALTER TABLE `subscription_catalog` ADD `fetched_logo_url` varchar(300);--> statement-breakpoint
ALTER TABLE `subscription_catalog` ADD `logo_fetched_at` datetime;