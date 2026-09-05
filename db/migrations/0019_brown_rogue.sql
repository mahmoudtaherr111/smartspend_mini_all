CREATE TABLE `ai_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`model_id` varchar(200) NOT NULL,
	`display_name` varchar(200) NOT NULL,
	`description_ar` text,
	`purposes` json NOT NULL,
	`allowed_tiers` json NOT NULL,
	`is_default_for_purpose` boolean NOT NULL DEFAULT false,
	`input_price_per_1m` decimal(10,6) NOT NULL DEFAULT '0.140000',
	`output_price_per_1m` decimal(10,6) NOT NULL DEFAULT '0.560000',
	`cached_price_per_1m` decimal(10,6) NOT NULL DEFAULT '0.014000',
	`max_context_tokens` int NOT NULL DEFAULT 128000,
	`supports_vision` boolean NOT NULL DEFAULT false,
	`supports_reasoning` boolean NOT NULL DEFAULT false,
	`supports_function_calling` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_models_provider_model_idx` UNIQUE(`provider_id`,`model_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(50) NOT NULL,
	`display_name` varchar(100) NOT NULL,
	`protocol` varchar(30) NOT NULL DEFAULT 'openai',
	`base_url` varchar(500) NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`supports_model_discovery` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 10,
	`health_status` varchar(20) NOT NULL DEFAULT 'unknown',
	`last_health_check` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_providers_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `ai_token_ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trace_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(20) NOT NULL,
	`billing_period` varchar(7) NOT NULL,
	`channel` varchar(30) NOT NULL,
	`provider_id` int,
	`provider_slug` varchar(50) NOT NULL,
	`model_id` varchar(200) NOT NULL,
	`prompt_tokens` int NOT NULL DEFAULT 0,
	`completion_tokens` int NOT NULL DEFAULT 0,
	`cached_tokens` int NOT NULL DEFAULT 0,
	`reasoning_tokens` int NOT NULL DEFAULT 0,
	`total_tokens` int NOT NULL DEFAULT 0,
	`system_prompt_tokens` int NOT NULL DEFAULT 0,
	`memory_rag_tokens` int NOT NULL DEFAULT 0,
	`history_tokens` int NOT NULL DEFAULT 0,
	`user_input_tokens` int NOT NULL DEFAULT 0,
	`tool_schema_tokens` int NOT NULL DEFAULT 0,
	`cost_usd` decimal(12,8) NOT NULL DEFAULT '0.00000000',
	`cost_egp` decimal(12,6) NOT NULL DEFAULT '0.000000',
	`latency_ms` int NOT NULL DEFAULT 0,
	`http_status` int NOT NULL DEFAULT 200,
	`finish_reason` varchar(30) DEFAULT 'stop',
	`conversation_id` int,
	`classification_log_id` int,
	`metadata` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_token_ledgers_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_token_ledgers_trace_id_unique` UNIQUE(`trace_id`)
);
--> statement-breakpoint
DROP INDEX `ai_memory_embedding_item_idx` ON `ai_memory_embeddings`;--> statement-breakpoint
DROP INDEX `ai_summary_user_idx` ON `ai_summaries`;--> statement-breakpoint
-- `business_categories` existed only in the schema snapshot used to generate
-- this migration; no earlier SQL migration creates the table or this index.
-- Keeping the generated DROP makes every clean installation fail here.
DROP INDEX `chat_msg_conv_idx` ON `chat_messages`;--> statement-breakpoint
DROP INDEX `expenses_user_idx` ON `expenses`;--> statement-breakpoint
DROP INDEX `reports_user_idx` ON `monthly_reports`;--> statement-breakpoint
DROP INDEX `user_dict_user_idx` ON `user_dictionaries`;--> statement-breakpoint
DROP INDEX `users_referral_idx` ON `users`;--> statement-breakpoint
DROP INDEX `webhook_tokens_token_idx` ON `webhook_tokens`;--> statement-breakpoint
CREATE INDEX `ai_models_provider_idx` ON `ai_models` (`provider_id`);--> statement-breakpoint
CREATE INDEX `ai_models_active_idx` ON `ai_models` (`is_active`);--> statement-breakpoint
CREATE INDEX `ai_providers_active_idx` ON `ai_providers` (`is_active`,`priority`);--> statement-breakpoint
CREATE INDEX `ai_providers_slug_idx` ON `ai_providers` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_ledger_user_period` ON `ai_token_ledgers` (`user_id`,`user_type`,`billing_period`);--> statement-breakpoint
CREATE INDEX `idx_ledger_channel` ON `ai_token_ledgers` (`channel`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_provider` ON `ai_token_ledgers` (`provider_slug`,`model_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_created` ON `ai_token_ledgers` (`created_at`);
