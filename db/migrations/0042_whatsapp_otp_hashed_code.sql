ALTER TABLE `whatsapp_otp_codes` ADD `code_hash` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_otp_codes` ADD `attempts` int DEFAULT 0 NOT NULL;