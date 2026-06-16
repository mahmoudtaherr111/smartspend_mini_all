CREATE TABLE `ai_pending_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`conversation_id` int,
	`action_name` varchar(120) NOT NULL,
	`status` varchar(40) NOT NULL DEFAULT 'pending_confirmation',
	`risk` varchar(30) NOT NULL DEFAULT 'medium',
	`summary` varchar(500) NOT NULL,
	`payload` json NOT NULL,
	`result` json,
	`expires_at` datetime NOT NULL,
	`confirmed_at` datetime,
	`executed_at` datetime,
	`cancelled_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_pending_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_action_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action_id` int,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`action_name` varchar(120) NOT NULL,
	`event` varchar(80) NOT NULL,
	`status` varchar(40) NOT NULL,
	`metadata` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_action_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_pending_action_user_idx` ON `ai_pending_actions` (`user_id`,`user_type`,`status`);--> statement-breakpoint
CREATE INDEX `ai_pending_action_expiry_idx` ON `ai_pending_actions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ai_pending_action_conversation_idx` ON `ai_pending_actions` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `ai_action_audit_action_idx` ON `ai_action_audit_logs` (`action_id`);--> statement-breakpoint
CREATE INDEX `ai_action_audit_user_idx` ON `ai_action_audit_logs` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `ai_action_audit_event_idx` ON `ai_action_audit_logs` (`event`);
