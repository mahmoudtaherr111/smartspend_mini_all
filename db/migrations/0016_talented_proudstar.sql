ALTER TABLE `expenses` ADD `client_request_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_user_client_request_unique` UNIQUE(`user_id`,`user_type`,`client_request_id`);
