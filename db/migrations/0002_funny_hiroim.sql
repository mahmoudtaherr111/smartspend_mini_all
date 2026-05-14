CREATE TABLE `user_dictionaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`user_type` varchar(50) NOT NULL,
	`word` varchar(100) NOT NULL,
	`category` varchar(100) NOT NULL,
	`sub_category` varchar(100),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_dictionaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_dict_word_unique` UNIQUE(`user_id`,`user_type`,`word`)
);
--> statement-breakpoint
CREATE INDEX `user_dict_user_idx` ON `user_dictionaries` (`user_id`,`user_type`);