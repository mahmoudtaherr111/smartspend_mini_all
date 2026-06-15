CREATE TABLE `in_app_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`action_url` varchar(500),
	`is_read` boolean DEFAULT false,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `in_app_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`template_id` int,
	`user_id` int,
	`user_type` varchar(50),
	`sent_via` varchar(50),
	`status` varchar(50) DEFAULT 'sent',
	`error_message` text,
	`sent_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`title_template` varchar(255) NOT NULL,
	`body_template` text NOT NULL,
	`is_active` boolean DEFAULT true,
	`target_segment` json,
	`send_at` datetime,
	`created_by` int,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `whatsapp_otp_codes` MODIFY COLUMN `code` varchar(20) NOT NULL;--> statement-breakpoint
CREATE INDEX `in_app_notif_user_idx` ON `in_app_notifications` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `in_app_notif_read_idx` ON `in_app_notifications` (`is_read`);--> statement-breakpoint
CREATE INDEX `notif_logs_user_idx` ON `notification_logs` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `notif_logs_template_idx` ON `notification_logs` (`template_id`);