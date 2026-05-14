CREATE TABLE `onboarding_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question_text` varchar(500) NOT NULL,
	`question_key` varchar(100) NOT NULL,
	`input_type` varchar(50) NOT NULL DEFAULT 'text',
	`options` json,
	`is_active` boolean DEFAULT true,
	`sort_order` int DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `onboarding_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `onboarding_questions_question_key_unique` UNIQUE(`question_key`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`monthly_income` decimal(12,2),
	`financial_goal` varchar(100),
	`financial_personality` varchar(50),
	`profile_completed` boolean DEFAULT false,
	`last_asked_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profile_user_idx` UNIQUE(`user_id`,`user_type`)
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `sub_category` varchar(100);--> statement-breakpoint
ALTER TABLE `local_users` ADD `ai_tokens_used` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `ai_tokens_used` int DEFAULT 0;