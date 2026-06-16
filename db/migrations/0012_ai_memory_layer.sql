CREATE TABLE `ai_conversation_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`conversation_id` int NOT NULL,
	`capsule` varchar(500) NOT NULL,
	`running_summary` text,
	`message_count` int DEFAULT 0,
	`source` varchar(50) NOT NULL DEFAULT 'chat',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_conversation_summaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_memory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`memory_type` varchar(50) NOT NULL DEFAULT 'fact',
	`content` text NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`importance` int NOT NULL DEFAULT 50,
	`source_conversation_id` int,
	`source_message_id` int,
	`status` varchar(30) NOT NULL DEFAULT 'active',
	`metadata` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_memory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_memory_embeddings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memory_item_id` int NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`provider` varchar(50) NOT NULL DEFAULT 'fireworks',
	`model` varchar(200) NOT NULL,
	`dimensions` int NOT NULL,
	`vector_hash` varchar(64),
	`vector` json,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_memory_embeddings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_action_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`action_name` varchar(120) NOT NULL,
	`status` varchar(40) NOT NULL,
	`summary` varchar(500) NOT NULL,
	`payload` json,
	`source_conversation_id` int,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_action_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_conv_summary_unique_idx` ON `ai_conversation_summaries` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `ai_conv_summary_user_idx` ON `ai_conversation_summaries` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `ai_conv_summary_updated_idx` ON `ai_conversation_summaries` (`updated_at`);--> statement-breakpoint
CREATE INDEX `ai_memory_user_idx` ON `ai_memory_items` (`user_id`,`user_type`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_memory_hash_unique_idx` ON `ai_memory_items` (`user_id`,`user_type`,`content_hash`);--> statement-breakpoint
CREATE INDEX `ai_memory_type_idx` ON `ai_memory_items` (`memory_type`);--> statement-breakpoint
CREATE INDEX `ai_memory_updated_idx` ON `ai_memory_items` (`updated_at`);--> statement-breakpoint
CREATE INDEX `ai_memory_embedding_item_idx` ON `ai_memory_embeddings` (`memory_item_id`);--> statement-breakpoint
CREATE INDEX `ai_memory_embedding_user_idx` ON `ai_memory_embeddings` (`user_id`,`user_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_memory_embedding_unique_idx` ON `ai_memory_embeddings` (`memory_item_id`,`provider`,`model`,`dimensions`);--> statement-breakpoint
CREATE INDEX `ai_action_memory_user_idx` ON `ai_action_memory` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `ai_action_memory_action_idx` ON `ai_action_memory` (`action_name`,`status`);--> statement-breakpoint
CREATE INDEX `ai_action_memory_updated_idx` ON `ai_action_memory` (`updated_at`);--> statement-breakpoint
INSERT INTO `system_settings` (`key`, `value`) VALUES
	('ai_memory_enabled', 'true'),
	('ai_memory_embedding_enabled', 'false'),
	('ai_embedding_provider', 'fireworks'),
	('ai_embedding_base_url', 'https://api.fireworks.ai/inference/v1'),
	('ai_embedding_model', 'accounts/fireworks/models/qwen3-embedding-8b'),
	('ai_embedding_dimensions_short', '256'),
	('ai_embedding_dimensions_memory', '768'),
	('ai_embedding_dimensions_deep', '1024')
ON DUPLICATE KEY UPDATE `value` = `value`;
