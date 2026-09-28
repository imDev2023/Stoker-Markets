CREATE TABLE "launch_markets" (
	"mint" text PRIMARY KEY NOT NULL,
	"price" double precision NOT NULL,
	"price_slot" bigint NOT NULL,
	"last_trade_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_assets" ADD COLUMN "category" text DEFAULT 'community' NOT NULL;--> statement-breakpoint
CREATE INDEX "launches_quote_mint_idx" ON "launches" USING btree ("quote_mint");--> statement-breakpoint
CREATE INDEX "trades_block_time_idx" ON "trades" USING btree ("block_time");
--> statement-breakpoint
-- Backfill: every Launch already indexed gets its curve's starting price (the same maths as initialCurveReserves in
-- @launchpad/chain), then the price after its latest trade on the curve or in its pool.
-- The Quote Registry refresh fills in categories; SOL's is known.
INSERT INTO "launch_markets" ("mint", "price", "price_slot")
SELECT l."mint",
	(c."vq" / c."vb")::double precision * power(10::double precision, l."decimals" - q."decimals"),
	l."created_slot"
FROM "launches" l
JOIN "quote_assets" q ON q."mint" = l."quote_mint"
CROSS JOIN LATERAL (
	SELECT trunc(trunc(l."graduation_target" * l."total_base_sell" * l."total_base_sell" / (l."supply" - l."total_base_sell")) / d."den") AS "vb",
		trunc(l."graduation_target" * l."graduation_target" / d."den") AS "vq"
	FROM (SELECT trunc(l."graduation_target" * l."total_base_sell" / (l."supply" - l."total_base_sell")) - l."graduation_target" AS "den") d
) c
WHERE l."supply" > l."total_base_sell" AND c."vb" > 0
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "launch_markets" ("mint", "price", "price_slot", "last_trade_at")
SELECT DISTINCT ON ("mint") "mint", "price_after", "slot", "block_time"
FROM "trades"
ORDER BY "mint", "slot" DESC, "event_index" DESC
ON CONFLICT ("mint") DO UPDATE SET "price" = excluded."price", "price_slot" = excluded."price_slot", "last_trade_at" = excluded."last_trade_at";--> statement-breakpoint
UPDATE "quote_assets" SET "category" = 'sol' WHERE "mint" = 'So11111111111111111111111111111111111111112';
