CREATE TABLE `whatsapp_otp_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`code` varchar(6) NOT NULL,
	`verified` boolean NOT NULL DEFAULT false,
	`expires_at` datetime NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `whatsapp_otp_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `system_settings` MODIFY COLUMN `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
CREATE INDEX `whatsapp_otp_phone_idx` ON `whatsapp_otp_codes` (`phone`);