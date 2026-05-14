CREATE TABLE IF NOT EXISTS `classification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`original_text` text NOT NULL,
	`normalized_text` text,
	`parsed_by` varchar(50) NOT NULL,
	`rule_engine_result` json,
	`ai_result` json,
	`final_result` json,
	`confidence` int DEFAULT 0,
	`decision` varchar(50),
	`classification_version` varchar(20) DEFAULT 'v2.1',
	`reasoning_trace_light` json,
	`ambiguity_flags` json,
	`input_channel` varchar(20) DEFAULT 'text',
	`needs_followup` boolean DEFAULT false,
	`was_corrected` boolean DEFAULT false,
	`correction` json,
	`model_used` varchar(100),
	`tokens_used` int DEFAULT 0,
	`processing_time_ms` int DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `classification_logs_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `cls_log_user_idx` ON `classification_logs` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `cls_log_parsed_idx` ON `classification_logs` (`parsed_by`);--> statement-breakpoint
CREATE INDEX `cls_log_date_idx` ON `classification_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `voice_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`duration_seconds` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`source` varchar(50) DEFAULT 'gemini_stt',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `voice_usage_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `voice_user_month_idx` ON `voice_usage` (`user_id`,`user_type`,`month`);--> statement-breakpoint
ALTER TABLE `classification_logs` ADD `classification_version` varchar(20) DEFAULT 'v2.1';--> statement-breakpoint
ALTER TABLE `classification_logs` ADD `reasoning_trace_light` json;--> statement-breakpoint
ALTER TABLE `classification_logs` ADD `ambiguity_flags` json;--> statement-breakpoint
ALTER TABLE `classification_logs` ADD `input_channel` varchar(20) DEFAULT 'text';--> statement-breakpoint
ALTER TABLE `classification_logs` ADD `needs_followup` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `expenses` ADD `payment_method` varchar(50);--> statement-breakpoint
ALTER TABLE `expenses` ADD `place_hint` varchar(150);--> statement-breakpoint
ALTER TABLE `expenses` ADD `parsed_metadata` json;
