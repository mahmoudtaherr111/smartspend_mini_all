ALTER TABLE `local_users` ADD `referred_by_type` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `referred_by_type` varchar(50);--> statement-breakpoint
ALTER TABLE `monthly_reports` ADD CONSTRAINT `reports_user_month_unique` UNIQUE(`user_id`,`user_type`,`month`);--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referral_referred_unique_idx` UNIQUE(`referred_id`,`referred_type`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);