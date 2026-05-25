CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`contactName` varchar(128),
	`lastMessage` text,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`unreadCount` int NOT NULL DEFAULT 0,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbox_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`sessionId` int NOT NULL,
	`waMessageId` varchar(128),
	`direction` enum('inbound','outbound') NOT NULL,
	`phone` varchar(32) NOT NULL,
	`body` text NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'text',
	`status` enum('received','sent','delivered','read','failed') NOT NULL DEFAULT 'received',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_messages_id` PRIMARY KEY(`id`)
);
