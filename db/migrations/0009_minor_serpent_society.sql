ALTER TABLE `push_subscriptions` MODIFY COLUMN `endpoint` text;--> statement-breakpoint
ALTER TABLE `push_subscriptions` MODIFY COLUMN `p256dh` varchar(255);--> statement-breakpoint
ALTER TABLE `push_subscriptions` MODIFY COLUMN `auth` varchar(255);--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `fcm_token` text;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `device_type` varchar(50) DEFAULT 'web';