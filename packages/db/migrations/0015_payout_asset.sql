CREATE TABLE "reward_sales" (
	"signature" text PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"venue" text NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"coins" numeric(40, 0) NOT NULL,
	"quote_mint" text NOT NULL,
	"quote_decimals" integer NOT NULL,
	"proceeds" numeric(40, 0),
	"round_id" text,
	"last_valid_block_height" bigint NOT NULL,
	"slot" bigint,
	"block_time" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD COLUMN "reward_payout" text;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "reward_payout" text;--> statement-breakpoint
-- Every Reward Launch so far pays in the coin itself: the only model there was before the Payout Asset (ADR 0006, #43).
UPDATE "launch_drafts" SET "reward_payout" = 'coin' WHERE "reward_tax_bps" IS NOT NULL;--> statement-breakpoint
UPDATE "launches" SET "reward_payout" = 'coin' WHERE "reward_tax_bps" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_rounds" ADD COLUMN "payout_mint" text;--> statement-breakpoint
ALTER TABLE "reward_rounds" ADD COLUMN "payout_decimals" integer;--> statement-breakpoint
ALTER TABLE "reward_rounds" ADD COLUMN "sold" numeric(40, 0);--> statement-breakpoint
-- Every round so far paid in its coin.
UPDATE "reward_rounds" r SET "payout_mint" = r."mint", "payout_decimals" = coalesce((SELECT l."decimals" FROM "launches" l WHERE l."mint" = r."mint"), 6);--> statement-breakpoint
ALTER TABLE "reward_rounds" ALTER COLUMN "payout_mint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_rounds" ALTER COLUMN "payout_decimals" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "reward_sales_mint_idx" ON "reward_sales" USING btree ("mint","status");--> statement-breakpoint
CREATE INDEX "reward_sales_round_idx" ON "reward_sales" USING btree ("round_id");