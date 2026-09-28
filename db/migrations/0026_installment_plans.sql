CREATE TABLE `installment_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`title` varchar(120) NOT NULL,
	`keyword` varchar(60) NOT NULL,
	`monthly_amount` decimal(12,2) NOT NULL,
	`total_installments` int NOT NULL,
	`paid_before` int NOT NULL DEFAULT 0,
	`status` varchar(30) NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `installment_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `installment_plans_user_idx` ON `installment_plans` (`user_id`,`user_type`,`status`);