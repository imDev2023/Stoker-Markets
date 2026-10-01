ALTER TABLE "quote_assets" ADD COLUMN "labels" jsonb;--> statement-breakpoint
ALTER TABLE "quote_assets" ADD COLUMN "labels_slot" bigint;--> statement-breakpoint
ALTER TABLE "quote_assets" ADD COLUMN "labels_checked_at" timestamp with time zone;