ALTER TABLE "launch_drafts" ADD COLUMN "reward_liquidity_bps" integer;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "reward_liquidity_bps" integer;--> statement-breakpoint
-- Every Reward Launch so far keeps nothing for its pool: the Reward Liquidity (#214) is new, and 0 is the behaviour there was before it.
UPDATE "launch_drafts" SET "reward_liquidity_bps" = 0 WHERE "reward_tax_bps" IS NOT NULL;--> statement-breakpoint
UPDATE "launches" SET "reward_liquidity_bps" = 0 WHERE "reward_tax_bps" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD CONSTRAINT "launch_drafts_reward_liquidity_bps" CHECK ("launch_drafts"."reward_liquidity_bps" between 0 and 5000 and coalesce("launch_drafts"."reward_burn_bps", 0) + "launch_drafts"."reward_liquidity_bps" <= 5000);--> statement-breakpoint
ALTER TABLE "launches" ADD CONSTRAINT "launches_reward_liquidity_bps" CHECK ("launches"."reward_liquidity_bps" between 0 and 5000 and coalesce("launches"."reward_burn_bps", 0) + "launches"."reward_liquidity_bps" <= 5000);