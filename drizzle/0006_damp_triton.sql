CREATE TABLE `automation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`automationId` int NOT NULL,
	`sessionId` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`triggeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`automationId` int NOT NULL,
	`stepOrder` int NOT NULL DEFAULT 1,
	`message` text NOT NULL,
	`delaySeconds` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`trigger` varchar(256) NOT NULL,
	`triggerType` enum('contains','exact','starts_with') NOT NULL DEFAULT 'contains',
	`isActive` enum('0','1') NOT NULL DEFAULT '1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automations_id` PRIMARY KEY(`id`)
);
