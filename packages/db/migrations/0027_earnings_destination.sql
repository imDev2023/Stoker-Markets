CREATE TABLE "creator_buybacks" (
	"signature" text PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"kind" text NOT NULL,
	"venue" text NOT NULL,
	"market" text NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"quote_mint" text NOT NULL,
	"quote_decimals" integer NOT NULL,
	"coin_decimals" integer NOT NULL,
	"budget" numeric(40, 0) NOT NULL,
	"spent" numeric(40, 0),
	"coins" numeric(40, 0),
	"burned" numeric(40, 0),
	"coins_added" numeric(40, 0),
	"quote_added" numeric(40, 0),
	"lp_amount" numeric(40, 0),
	"fee_key" text,
	"locked_liquidity" text,
	"last_valid_block_height" bigint NOT NULL,
	"slot" bigint,
	"block_time" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fee_keys" DROP CONSTRAINT "fee_keys_pool_unique";--> statement-breakpoint
ALTER TABLE "fee_keys" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "launch_drafts" ADD COLUMN "earnings_destination" text DEFAULT 'wallet' NOT NULL;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "earnings_destination" text DEFAULT 'wallet' NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_rounds" ADD COLUMN "source" text DEFAULT 'tax' NOT NULL;--> statement-breakpoint
CREATE INDEX "creator_buybacks_mint_idx" ON "creator_buybacks" USING btree ("mint","status");--> statement-breakpoint
CREATE INDEX "fee_keys_pool_idx" ON "fee_keys" USING btree ("pool");--> statement-breakpoint
CREATE INDEX "fee_keys_checked_at_idx" ON "fee_keys" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "reward_rounds_source_status_idx" ON "reward_rounds" USING btree ("source","status");