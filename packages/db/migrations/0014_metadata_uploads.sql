CREATE TABLE "arweave_top_ups" (
	"signature" text PRIMARY KEY NOT NULL,
	"lamports" numeric(40, 0) NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"winc" numeric(40, 0),
	"last_valid_block_height" bigint NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "metadata_uploads" (
	"mint" text NOT NULL,
	"item" text NOT NULL,
	"arweave_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"bytes" integer NOT NULL,
	"status" text DEFAULT 'signed' NOT NULL,
	"winc" numeric(40, 0),
	"lamports" numeric(40, 0),
	"receipt" jsonb,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	CONSTRAINT "metadata_uploads_mint_item_pk" PRIMARY KEY("mint","item")
);
--> statement-breakpoint
CREATE INDEX "metadata_uploads_status_idx" ON "metadata_uploads" USING btree ("status");