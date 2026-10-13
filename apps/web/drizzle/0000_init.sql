CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `event_categories` (
	`event_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `category_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`city` text,
	`latitude` real,
	`longitude` real,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`organizer_id` text,
	`link` text,
	`cash_prize` integer,
	`tags` text,
	`participants_count` integer DEFAULT 0,
	`cover_url` text,
	`created_at` integer,
	`mode` text,
	`country` text,
	`country_code` text,
	`venue` text,
	`enriched_at` integer,
	`classification_status` text DEFAULT 'pending' NOT NULL,
	`classification_confidence` real,
	`classification_reason` text,
	`classification_model` text,
	`classified_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_link_unique` ON `events` (`link`);