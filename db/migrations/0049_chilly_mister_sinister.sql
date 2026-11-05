CREATE TABLE `support_assignments` (
	`ticket_id` int NOT NULL,
	`staff_id` int NOT NULL,
	`staff_type` varchar(50) NOT NULL,
	`assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `support_assignments_ticket_id` PRIMARY KEY(`ticket_id`)
);
--> statement-breakpoint
CREATE INDEX `support_assignments_staff_idx` ON `support_assignments` (`staff_id`,`staff_type`);