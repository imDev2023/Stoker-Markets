CREATE TABLE "reward_payouts" (
	"round_id" text NOT NULL,
	"wallet" text NOT NULL,
	"holding" numeric(40, 0) NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"signature" text,
	"sendable_until" bigint,
	"paid_at" timestamp with time zone,
	CONSTRAINT "reward_payouts_round_id_wallet_pk" PRIMARY KEY("round_id","wallet")
);
--> statement-breakpoint
CREATE TABLE "reward_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"rules_version" integer NOT NULL,
	"status" text NOT NULL,
	"snapshot_slot" bigint NOT NULL,
	"pot" numeric(40, 0) NOT NULL,
	"eligible_holders" integer NOT NULL,
	"distributable" numeric(40, 0) NOT NULL,
	"paid" numeric(40, 0) DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reward_rules" (
	"version" integer PRIMARY KEY NOT NULL,
	"min_holding" numeric(40, 0) NOT NULL,
	"round_threshold" numeric(40, 0) NOT NULL,
	"note" text,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reward_payouts_wallet_idx" ON "reward_payouts" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "reward_rounds_mint_started_idx" ON "reward_rounds" USING btree ("mint","started_at");--> statement-breakpoint
-- The first rules version, in force from the start: a wallet must hold at least 10,000 coins (0.001% of the 1B supply)
-- at the snapshot, and a round runs once 100,000 coins (0.01% of the supply) of tax have collected. Both in raw units
-- of a 6-decimal coin.
INSERT INTO "reward_rules" ("version", "min_holding", "round_threshold", "note", "announced_at", "effective_at")
VALUES (1, 10000000000, 100000000000, 'first rules', now(), now());
