CREATE TABLE `ad_clicks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ad_id` int NOT NULL,
	`user_id` int,
	`user_type` varchar(50),
	`ip_address` varchar(100),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ad_clicks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`image_url` varchar(500),
	`link_url` varchar(500),
	`placement` varchar(100) NOT NULL DEFAULT 'sidebar',
	`target_plan` varchar(50) DEFAULT 'free',
	`start_date` datetime,
	`end_date` datetime,
	`clicks` int DEFAULT 0,
	`impressions` int DEFAULT 0,
	`is_active` boolean DEFAULT true,
	`created_by` int,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`period` varchar(50) NOT NULL,
	`period_value` varchar(50) NOT NULL,
	`model` varchar(100) DEFAULT 'gemini-1.5-flash',
	`content` text NOT NULL,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_summary_period_idx` UNIQUE(`user_id`,`user_type`,`period`,`period_value`)
);
--> statement-breakpoint
CREATE TABLE `discount_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'referral',
	`discount_percent` int DEFAULT 0,
	`max_uses` int,
	`used_count` int DEFAULT 0,
	`created_by` int,
	`expires_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `discount_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_type` varchar(50),
	`name` varchar(100) NOT NULL,
	`icon` varchar(50),
	`color` varchar(50),
	`is_default` boolean DEFAULT false,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `expense_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'expense',
	`amount` decimal(12,2) NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` text,
	`raw_text` text,
	`source` varchar(50) NOT NULL DEFAULT 'manual',
	`date` datetime NOT NULL,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`password` varchar(255) NOT NULL,
	`email` varchar(255),
	`role` varchar(50) NOT NULL DEFAULT 'user',
	`plan` varchar(50) NOT NULL DEFAULT 'free',
	`referral_code` varchar(50),
	`referred_by` int,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`last_sign_in_at` datetime,
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_phone_unique` UNIQUE(`phone`),
	CONSTRAINT `local_users_referral_code_unique` UNIQUE(`referral_code`)
);
--> statement-breakpoint
CREATE TABLE `monthly_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`month` varchar(7) NOT NULL,
	`total_amount` decimal(12,2) NOT NULL,
	`total_income` decimal(12,2) DEFAULT '0.00',
	`category_breakdown` json,
	`top_categories` json,
	`daily_average` decimal(12,2),
	`highest_day` varchar(10),
	`insights` text,
	`ai_report` text,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pro_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`plan` varchar(50) NOT NULL DEFAULT 'pro_monthly',
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`start_date` datetime NOT NULL,
	`end_date` datetime NOT NULL,
	`payment_method` varchar(100),
	`transaction_id` varchar(255),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pro_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrer_id` int NOT NULL,
	`referrer_type` varchar(50) NOT NULL,
	`referred_id` int NOT NULL,
	`referred_type` varchar(50) NOT NULL,
	`code_used` varchar(100),
	`status` varchar(50) DEFAULT 'pending',
	`reward_given` boolean DEFAULT false,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`),
	CONSTRAINT `referral_unique_idx` UNIQUE(`referrer_id`,`referrer_type`,`referred_id`,`referred_type`)
);
--> statement-breakpoint
CREATE TABLE `seo_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`path` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`keywords` text,
	`og_image` varchar(500),
	`canonical_url` varchar(500),
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_pages_path_unique` UNIQUE(`path`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`token` varchar(500) NOT NULL,
	`ip_address` varchar(100),
	`user_agent` text,
	`expires_at` datetime NOT NULL,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'open',
	`priority` varchar(50) DEFAULT 'medium',
	`assigned_to` int,
	`response` text,
	`responded_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`event` varchar(100) NOT NULL,
	`metadata` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`union_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255),
	`avatar` varchar(500),
	`role` varchar(50) NOT NULL DEFAULT 'user',
	`plan` varchar(50) NOT NULL DEFAULT 'free',
	`referral_code` varchar(50),
	`referred_by` int,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`last_sign_in_at` datetime,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_union_id_unique` UNIQUE(`union_id`),
	CONSTRAINT `users_referral_code_unique` UNIQUE(`referral_code`)
);
--> statement-breakpoint
CREATE INDEX `ai_summary_user_idx` ON `ai_summaries` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `expenses_user_idx` ON `expenses` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `expenses_type_idx` ON `expenses` (`type`);--> statement-breakpoint
CREATE INDEX `local_users_role_idx` ON `local_users` (`role`);--> statement-breakpoint
CREATE INDEX `local_users_plan_idx` ON `local_users` (`plan`);--> statement-breakpoint
CREATE INDEX `pro_sub_user_idx` ON `pro_subscriptions` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `sessions_token_idx` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `tickets_user_idx` ON `support_tickets` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `tickets_assigned_idx` ON `support_tickets` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `analytics_user_idx` ON `user_analytics` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `analytics_event_idx` ON `user_analytics` (`event`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_plan_idx` ON `users` (`plan`);--> statement-breakpoint
CREATE INDEX `users_referral_idx` ON `users` (`referral_code`);