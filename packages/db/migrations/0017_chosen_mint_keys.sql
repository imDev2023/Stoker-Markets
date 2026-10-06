CREATE TABLE "chosen_mint_keys" (
	"mint" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_drafts" ALTER COLUMN "mint_key_nonce" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "chosen_mint_keys_creator_idx" ON "chosen_mint_keys" USING btree ("creator");