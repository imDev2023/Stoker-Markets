CREATE TABLE "curves" (
	"mint" text PRIMARY KEY NOT NULL,
	"real_quote" numeric(40, 0) NOT NULL,
	"real_base" numeric(40, 0) NOT NULL,
	"price" double precision NOT NULL,
	"status" text NOT NULL,
	"slot" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"mint" text NOT NULL,
	"trader" text NOT NULL,
	"side" text NOT NULL,
	"base_amount" numeric(40, 0) NOT NULL,
	"quote_amount" numeric(40, 0) NOT NULL,
	"protocol_fee" numeric(40, 0) NOT NULL,
	"platform_fee" numeric(40, 0) NOT NULL,
	"creator_fee" numeric(40, 0) NOT NULL,
	"price_before" double precision NOT NULL,
	"price_after" double precision NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE INDEX "trades_mint_slot_idx" ON "trades" USING btree ("mint","slot");