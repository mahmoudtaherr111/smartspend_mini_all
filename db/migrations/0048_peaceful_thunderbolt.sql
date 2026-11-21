CREATE TABLE `scheduled_job_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`job_name` varchar(80) NOT NULL,
	`started_at` datetime NOT NULL,
	`duration_ms` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`error_name` varchar(120),
	`host` varchar(120),
	CONSTRAINT `scheduled_job_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `job_runs_name_started_idx` ON `scheduled_job_runs` (`job_name`,`started_at`);