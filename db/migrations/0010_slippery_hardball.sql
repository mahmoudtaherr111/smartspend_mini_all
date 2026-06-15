ALTER TABLE `notification_templates` MODIFY COLUMN `title_template` varchar(255);--> statement-breakpoint
ALTER TABLE `notification_templates` MODIFY COLUMN `body_template` text;--> statement-breakpoint
ALTER TABLE `notification_templates` ADD `title_template_ar` varchar(255);--> statement-breakpoint
ALTER TABLE `notification_templates` ADD `body_template_ar` text;--> statement-breakpoint
ALTER TABLE `notification_templates` ADD `title_template_en` varchar(255);--> statement-breakpoint
ALTER TABLE `notification_templates` ADD `body_template_en` text;