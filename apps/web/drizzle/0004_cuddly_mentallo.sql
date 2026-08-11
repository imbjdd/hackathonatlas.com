ALTER TABLE "events" ADD COLUMN "classification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "classification_confidence" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "classification_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "classification_model" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "classified_at" timestamp;