CREATE TABLE "creator_ladders" (
	"version" integer PRIMARY KEY NOT NULL,
	"second_bps" integer NOT NULL,
	"second_active_days" integer NOT NULL,
	"top_bps" integer NOT NULL,
	"top_active_days" integer NOT NULL,
	"active_day_floor_bps" integer NOT NULL,
	"note" text,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creator_ladders_shares_climb" CHECK ("creator_ladders"."second_bps" > 5000 and "creator_ladders"."top_bps" > "creator_ladders"."second_bps" and "creator_ladders"."top_bps" <= 10000),
	CONSTRAINT "creator_ladders_days_climb" CHECK ("creator_ladders"."second_active_days" >= 1 and "creator_ladders"."top_active_days" > "creator_ladders"."second_active_days"),
	CONSTRAINT "creator_ladders_floor" CHECK ("creator_ladders"."active_day_floor_bps" >= 1 and "creator_ladders"."active_day_floor_bps" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "creator_tiers" (
	"mint" text NOT NULL,
	"tier" integer NOT NULL,
	"active_days" integer NOT NULL,
	"ladder_version" integer NOT NULL,
	"reached_slot" bigint NOT NULL,
	"reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_tiers_mint_tier_pk" PRIMARY KEY("mint","tier"),
	CONSTRAINT "creator_tiers_tier" CHECK ("creator_tiers"."tier" in (2, 3))
);
--> statement-breakpoint
-- The first version (ADR 0020, owner 2026-11-10), in force from the first lamport: half on the curve and after
-- Graduation, 60% once a coin has 15 Active Days, 70% once it has 30, a day counting when its pool traded at least 1%
-- of the coin's Graduation Target. Nothing collected before this migration moves: a tier's share applies to the pool
-- fees collected after the tier was recorded, and no coin has a tier yet.
INSERT INTO "creator_ladders" ("version", "second_bps", "second_active_days", "top_bps", "top_active_days", "active_day_floor_bps", "note", "announced_at", "effective_at")
VALUES (1, 6000, 15, 7000, 30, 100, 'first ladder', now(), now());
