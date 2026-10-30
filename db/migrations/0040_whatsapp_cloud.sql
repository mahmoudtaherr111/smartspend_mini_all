CREATE TABLE `whatsapp_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`bsuid` varchar(160),
	`reports_consent` boolean NOT NULL DEFAULT false,
	`reminders_consent` boolean NOT NULL DEFAULT false,
	`marketing_consent` boolean NOT NULL DEFAULT false,
	`marketing_consent_at` datetime,
	`marketing_consent_source` varchar(32),
	`opted_out_at` datetime,
	`last_inbound_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_contacts_user_idx` UNIQUE(`user_id`,`user_type`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_type` varchar(50),
	`recipient` varchar(20),
	`purpose` varchar(32) NOT NULL,
	`template_name` varchar(128),
	`language` varchar(10),
	`params` json,
	`status` varchar(16) NOT NULL DEFAULT 'queued',
	`meta_message_id` varchar(128),
	`error_code` int,
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime,
	`broadcast_id` int,
	`pricing_category` varchar(32),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`sent_at` datetime,
	`delivered_at` datetime,
	`read_at` datetime,
	`failed_at` datetime,
	CONSTRAINT `whatsapp_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_messages_meta_idx` UNIQUE(`meta_message_id`)
);
--> statement-breakpoint
CREATE INDEX `whatsapp_contacts_bsuid_idx` ON `whatsapp_contacts` (`bsuid`);--> statement-breakpoint
CREATE INDEX `whatsapp_messages_user_idx` ON `whatsapp_messages` (`user_id`,`user_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `whatsapp_messages_due_idx` ON `whatsapp_messages` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `whatsapp_messages_broadcast_idx` ON `whatsapp_messages` (`broadcast_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_messages_created_idx` ON `whatsapp_messages` (`created_at`);