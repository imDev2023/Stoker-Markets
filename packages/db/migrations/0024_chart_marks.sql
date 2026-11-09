CREATE TABLE "coin_mentions" (
	"mint" text NOT NULL,
	"tweet_id" text NOT NULL,
	"url" text NOT NULL,
	"text" text NOT NULL,
	"author_id" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_name" text,
	"author_avatar" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"market_cap" double precision,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_mentions_mint_tweet_id_pk" PRIMARY KEY("mint","tweet_id")
);
--> statement-breakpoint
CREATE TABLE "mention_polls" (
	"mint" text PRIMARY KEY NOT NULL,
	"polled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notable_wallets" (
	"wallet" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"name" text,
	"avatar" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "coin_mentions_mint_posted_idx" ON "coin_mentions" USING btree ("mint","posted_at");