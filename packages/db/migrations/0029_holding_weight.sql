CREATE TABLE "holding_checks" (
	"mint" text NOT NULL,
	"day" integer NOT NULL,
	"slot" bigint NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"wallets" integer NOT NULL,
	CONSTRAINT "holding_checks_mint_day_pk" PRIMARY KEY("mint","day")
);
--> statement-breakpoint
CREATE TABLE "holding_lots" (
	"mint" text NOT NULL,
	"wallet" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	CONSTRAINT "holding_lots_mint_wallet_since_pk" PRIMARY KEY("mint","wallet","since")
);
--> statement-breakpoint
-- Written by hand around the generated column (ADR 0022): a payout from before the Holding Weight was pro rata of its
-- holding, which is its holding counted once, 10000 basis points. The column is added empty, filled, then required.
ALTER TABLE "reward_payouts" ADD COLUMN "weighted_holding" numeric(40, 0);--> statement-breakpoint
UPDATE "reward_payouts" SET "weighted_holding" = "holding" * 10000;--> statement-breakpoint
ALTER TABLE "reward_payouts" ALTER COLUMN "weighted_holding" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_rounds" ADD COLUMN "weighted_total" numeric(40, 0);--> statement-breakpoint
ALTER TABLE "reward_rules" ADD COLUMN "holding_weights" jsonb DEFAULT '[]'::jsonb NOT NULL;