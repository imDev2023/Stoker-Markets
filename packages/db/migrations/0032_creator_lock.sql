ALTER TABLE "launch_drafts" ADD COLUMN "creator_lock_bps" integer;--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD COLUMN "creator_lock_cliff_seconds" integer;--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD COLUMN "creator_lock_unlock_seconds" integer;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "locked_amount" numeric(40, 0);--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "lock_cliff_seconds" integer;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "lock_unlock_seconds" integer;--> statement-breakpoint
ALTER TABLE "quote_assets" ADD COLUMN "creator_lock_cap_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD CONSTRAINT "launch_drafts_creator_lock" CHECK (("launch_drafts"."creator_lock_bps" is null and "launch_drafts"."creator_lock_cliff_seconds" is null and "launch_drafts"."creator_lock_unlock_seconds" is null) or ("launch_drafts"."creator_lock_bps" between 1 and 2000 and "launch_drafts"."creator_lock_cliff_seconds" >= 0 and "launch_drafts"."creator_lock_unlock_seconds" >= 0));--> statement-breakpoint
ALTER TABLE "launches" ADD CONSTRAINT "launches_creator_lock" CHECK (("launches"."locked_amount" is null and "launches"."lock_cliff_seconds" is null and "launches"."lock_unlock_seconds" is null) or ("launches"."locked_amount" > 0 and "launches"."lock_cliff_seconds" >= 0 and "launches"."lock_unlock_seconds" >= 0));