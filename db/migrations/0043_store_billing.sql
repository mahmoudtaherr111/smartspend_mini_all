CREATE TABLE `store_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`store` varchar(50) NOT NULL,
	`store_product_id` varchar(100) NOT NULL,
	`original_transaction_id` varchar(255) NOT NULL,
	`purchase_token` text NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`expires_at` datetime,
	`raw_payload` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `store_purchases_user_idx` ON `store_purchases` (`user_id`,`user_type`);--> statement-breakpoint
CREATE INDEX `store_purchases_orig_tx_idx` ON `store_purchases` (`original_transaction_id`);--> statement-breakpoint
CREATE INDEX `store_purchases_store_idx` ON `store_purchases` (`store`);--> statement-breakpoint
CREATE INDEX `store_purchases_status_idx` ON `store_purchases` (`status`);
