-- Open challenges carry plain codes the new flow cannot check; they live ten minutes, so they are dropped.
DELETE FROM `whatsapp_otp_codes`;--> statement-breakpoint
ALTER TABLE `whatsapp_otp_codes` DROP COLUMN `code`;
