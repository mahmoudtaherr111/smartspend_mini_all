CREATE TABLE `api_key_errors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(50) NOT NULL,
	`key_label` varchar(100) NOT NULL,
	`error_type` varchar(100) NOT NULL,
	`message` text NOT NULL,
	`http_status` int,
	`user_id` int,
	`resolved` boolean DEFAULT false,
	`resolved_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `api_key_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`id` varchar(100) NOT NULL,
	`challenge` varchar(255) NOT NULL,
	`user_id` int,
	`user_type` varchar(50),
	`expires_at` datetime NOT NULL,
	CONSTRAINT `auth_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`target_amount` decimal(12,2),
	`target_date` datetime,
	`status` varchar(30) NOT NULL DEFAULT 'active',
	`ai_plan` json,
	`ai_alerts` json,
	`last_analyzed_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pending_clarifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`expense_id` int,
	`question` text NOT NULL,
	`original_text` text NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`context_data` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `pending_clarifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`relation` varchar(100),
	`aliases` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`id` varchar(255) NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`public_key` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`device_type` varchar(50) NOT NULL DEFAULT 'singleDevice',
	`backed_up` boolean NOT NULL DEFAULT false,
	`transports` varchar(255),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`last_used_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`provider` varchar(50) NOT NULL,
	`last_four_digits` varchar(4),
	`balance` decimal(12,2) DEFAULT '0.00',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_wallets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `status` varchar(50) DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
CREATE INDEX `api_key_errors_provider_idx` ON `api_key_errors` (`provider`);--> statement-breakpoint
CREATE INDEX `api_key_errors_type_idx` ON `api_key_errors` (`error_type`);--> statement-breakpoint
CREATE INDEX `api_key_errors_resolved_idx` ON `api_key_errors` (`resolved`);--> statement-breakpoint
CREATE INDEX `api_key_errors_date_idx` ON `api_key_errors` (`created_at`);--> statement-breakpoint
CREATE INDEX `financial_goals_user_idx` ON `financial_goals` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `financial_goals_status_idx` ON `financial_goals` (`status`);--> statement-breakpoint
CREATE INDEX `clarifications_user_idx` ON `pending_clarifications` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `clarifications_status_idx` ON `pending_clarifications` (`status`);--> statement-breakpoint
CREATE INDEX `push_subs_user_idx` ON `push_subscriptions` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `contacts_user_idx` ON `user_contacts` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `contacts_name_idx` ON `user_contacts` (`name`);--> statement-breakpoint
CREATE INDEX `credentials_user_idx` ON `user_credentials` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `wallets_user_idx` ON `user_wallets` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `expenses_status_idx` ON `expenses` (`status`);