CREATE TABLE `user_budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`category` varchar(100),
	`monthly_limit` decimal(12,2) NOT NULL,
	`period_start_day` int NOT NULL DEFAULT 1,
	`linked_goal_id` int,
	`status` varchar(30) NOT NULL DEFAULT 'active',
	`alert_threshold_percent` int NOT NULL DEFAULT 80,
	`metadata` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_budgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `user_budgets_user_idx` ON `user_budgets` (`user_id`,`user_type`,`status`);--> statement-breakpoint
CREATE INDEX `user_budgets_category_idx` ON `user_budgets` (`category`);--> statement-breakpoint
CREATE INDEX `user_budgets_goal_idx` ON `user_budgets` (`linked_goal_id`);
