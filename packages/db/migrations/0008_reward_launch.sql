ALTER TABLE "launch_drafts" ADD COLUMN "reward_tax_bps" integer;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "reward_tax_bps" integer;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "reward_tax_locked_signature" text;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "reward_tax_locked_at" timestamp with time zone;