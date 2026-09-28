CREATE TABLE "airdrop_recipients" (
	"mint" text NOT NULL,
	"wallet" text NOT NULL,
	"position" integer NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"sendable_until" bigint,
	"paid_signature" text,
	"paid_at" timestamp with time zone,
	CONSTRAINT "airdrop_recipients_mint_wallet_pk" PRIMARY KEY("mint","wallet")
);
--> statement-breakpoint
CREATE TABLE "launch_drafts" (
	"mint" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"mint_key_nonce" text NOT NULL,
	"quote_mint" text NOT NULL,
	"global_config" text NOT NULL,
	"graduation_target" numeric(40, 0) NOT NULL,
	"graduation_target_lamports" numeric(40, 0) NOT NULL,
	"first_buy" numeric(40, 0),
	"airdrop_scanned_until" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "launch_drafts_creator_idx" ON "launch_drafts" USING btree ("creator");