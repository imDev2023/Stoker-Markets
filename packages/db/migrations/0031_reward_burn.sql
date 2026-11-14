ALTER TABLE "launch_drafts" ADD COLUMN "reward_burn_bps" integer;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "reward_burn_bps" integer;--> statement-breakpoint
-- Every Reward Launch so far burns nothing: the Reward Burn (#183) is new, and 0 is the behaviour there was before it.
UPDATE "launch_drafts" SET "reward_burn_bps" = 0 WHERE "reward_tax_bps" IS NOT NULL;--> statement-breakpoint
UPDATE "launches" SET "reward_burn_bps" = 0 WHERE "reward_tax_bps" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD CONSTRAINT "launch_drafts_reward_burn_bps" CHECK ("launch_drafts"."reward_burn_bps" between 0 and 5000);--> statement-breakpoint
ALTER TABLE "launches" ADD CONSTRAINT "launches_reward_burn_bps" CHECK ("launches"."reward_burn_bps" between 0 and 5000);