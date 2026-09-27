CREATE TABLE "creator_fee_claims" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"creator" text NOT NULL,
	"quote_mint" text NOT NULL,
	"quote_decimals" integer NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_fee_claims_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE INDEX "creator_fee_claims_creator_slot_idx" ON "creator_fee_claims" USING btree ("creator","slot");