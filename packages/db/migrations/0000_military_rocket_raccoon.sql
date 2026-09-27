CREATE TABLE "launch_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"description" text NOT NULL,
	"image_key" text NOT NULL,
	"image_content_type" text NOT NULL,
	"website" text,
	"x" text,
	"telegram" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launches" (
	"mint" text PRIMARY KEY NOT NULL,
	"pool" text NOT NULL,
	"creator" text NOT NULL,
	"quote_mint" text NOT NULL,
	"global_config" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"metadata_uri" text NOT NULL,
	"decimals" integer NOT NULL,
	"supply" numeric(40, 0) NOT NULL,
	"total_base_sell" numeric(40, 0) NOT NULL,
	"graduation_target" numeric(40, 0) NOT NULL,
	"created_signature" text NOT NULL,
	"created_slot" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launches_pool_unique" UNIQUE("pool")
);
--> statement-breakpoint
CREATE INDEX "launches_created_slot_idx" ON "launches" USING btree ("created_slot");--> statement-breakpoint
CREATE INDEX "launches_creator_idx" ON "launches" USING btree ("creator");