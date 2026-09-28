CREATE TABLE "api_key_usage" (
	"key_id" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_key_usage_key_id_minute_pk" PRIMARY KEY("key_id","minute")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"name" text NOT NULL,
	"rate_limit_per_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "fee_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_fee_bps" integer NOT NULL,
	"creator_fee_bps" integer NOT NULL,
	"note" text,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"applied_signature" text,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quote_assets" ADD COLUMN "max_share_fee_rate" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "share_fee" numeric(40, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "referrer" text;--> statement-breakpoint
CREATE INDEX "fee_announcements_effective_idx" ON "fee_announcements" USING btree ("effective_at");