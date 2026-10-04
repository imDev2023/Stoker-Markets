ALTER TABLE "graduations" ADD COLUMN "backfilled_until" text;--> statement-breakpoint
ALTER TABLE "graduations" ADD COLUMN "backfill_closed_at" timestamp with time zone;