CREATE TABLE "budget_tables" (
	"version" integer PRIMARY KEY NOT NULL,
	"burn_bps" integer NOT NULL,
	"flywheel_bps" integer NOT NULL,
	"rebates_bps" integer NOT NULL,
	"referrals_bps" integer NOT NULL,
	"integrators_bps" integer NOT NULL,
	"treasury_bps" integer NOT NULL,
	"note" text,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	CONSTRAINT "budget_tables_shares_sum" CHECK ("budget_tables"."burn_bps" + "budget_tables"."flywheel_bps" + "budget_tables"."rebates_bps" + "budget_tables"."referrals_bps" + "budget_tables"."integrators_bps" + "budget_tables"."treasury_bps" = 10000),
	CONSTRAINT "budget_tables_shares_not_negative" CHECK ("budget_tables"."burn_bps" >= 0 and "budget_tables"."flywheel_bps" >= 0 and "budget_tables"."rebates_bps" >= 0 and "budget_tables"."referrals_bps" >= 0 and "budget_tables"."integrators_bps" >= 0 and "budget_tables"."treasury_bps" >= 0)
);
--> statement-breakpoint
-- The first version (ADR 0019), in force from the first lamport: what every deployment ran from its BURN_SHARE_BPS and
-- FLYWHEEL_SHARE_BPS settings until now. The trader programs' rows wait at 0 until each is built, and the treasury
-- takes the remainder.
INSERT INTO "budget_tables" ("version", "burn_bps", "flywheel_bps", "rebates_bps", "referrals_bps", "integrators_bps", "treasury_bps", "note", "announced_at", "effective_at")
VALUES (1, 6000, 500, 0, 0, 0, 3500, 'first table', now(), now());
