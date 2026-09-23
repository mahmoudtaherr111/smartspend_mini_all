CREATE TABLE `voice_call_incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`call_id` varchar(40) NOT NULL,
	`kind` varchar(40) NOT NULL,
	`detail` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `voice_call_incidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_calls` (
	`id` varchar(40) NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'starting',
	`engine` varchar(40) NOT NULL,
	`model` varchar(100) NOT NULL,
	`voice` varchar(40),
	`client` varchar(20),
	`month` varchar(7) NOT NULL,
	`started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`connected_at` datetime,
	`ended_at` datetime,
	`last_checkpoint_at` datetime,
	`billed_seconds` int NOT NULL DEFAULT 0,
	`max_seconds` int NOT NULL DEFAULT 0,
	`end_reason` varchar(40),
	`turns` int NOT NULL DEFAULT 0,
	`tool_calls` int NOT NULL DEFAULT 0,
	`incidents` int NOT NULL DEFAULT 0,
	`reconnects` int NOT NULL DEFAULT 0,
	`tokens` json,
	`cost_usd` decimal(12,8) NOT NULL DEFAULT '0.00000000',
	`memory_status` varchar(20) NOT NULL DEFAULT 'pending',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `voice_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `voice_call_incidents_user_idx` ON `voice_call_incidents` (`user_id`,`user_type`);
--> statement-breakpoint
CREATE INDEX `voice_call_incidents_call_idx` ON `voice_call_incidents` (`call_id`);
--> statement-breakpoint
CREATE INDEX `voice_call_incidents_created_idx` ON `voice_call_incidents` (`created_at`);
--> statement-breakpoint
CREATE INDEX `voice_calls_user_month_idx` ON `voice_calls` (`user_id`,`user_type`,`month`);
--> statement-breakpoint
CREATE INDEX `voice_calls_started_idx` ON `voice_calls` (`started_at`);
--> statement-breakpoint
CREATE INDEX `voice_calls_status_idx` ON `voice_calls` (`status`);
