CREATE TABLE `campaign_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`name` varchar(128),
	`status` enum('pending','sent','delivered','read','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`messageId` varchar(128),
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`totalContacts` int NOT NULL DEFAULT 0,
	`sentCount` int NOT NULL DEFAULT 0,
	`successCount` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`pendingCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`name` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL DEFAULT 'Sessão Principal',
	`accessToken` text NOT NULL,
	`phoneNumberId` varchar(64) NOT NULL,
	`isActive` enum('0','1') NOT NULL DEFAULT '1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_sessions_id` PRIMARY KEY(`id`)
);
