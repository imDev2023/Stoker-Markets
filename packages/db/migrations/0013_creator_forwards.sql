CREATE TABLE "creator_forwards" (
	"signature" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"asset_mint" text NOT NULL,
	"asset_decimals" integer NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"last_valid_block_height" bigint NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "creator_forwards_creator_idx" ON "creator_forwards" USING btree ("creator","asset_mint");--> statement-breakpoint
CREATE INDEX "creator_forwards_status_idx" ON "creator_forwards" USING btree ("status");