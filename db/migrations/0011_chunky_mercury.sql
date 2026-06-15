CREATE TABLE `chat_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`title` varchar(255),
	`message_count` int DEFAULT 0,
	`total_tokens` int DEFAULT 0,
	`last_message_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversation_id` int NOT NULL,
	`role` varchar(20) NOT NULL,
	`content` text NOT NULL,
	`tool_calls` json,
	`tool_results` json,
	`tokens_used` int DEFAULT 0,
	`model` varchar(100),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `chat_conv_user_idx` ON `chat_conversations` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `chat_conv_last_msg_idx` ON `chat_conversations` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `chat_msg_conv_idx` ON `chat_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `chat_msg_created_idx` ON `chat_messages` (`conversation_id`,`created_at`);