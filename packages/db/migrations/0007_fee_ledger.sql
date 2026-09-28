CREATE TABLE "fee_keys" (
	"nft_mint" text PRIMARY KEY NOT NULL,
	"nft_account" text NOT NULL,
	"locked_liquidity" text NOT NULL,
	"pool" text NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_keys_pool_unique" UNIQUE("pool")
);
--> statement-breakpoint
CREATE TABLE "job_locks" (
	"job" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_transactions" (
	"signature" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"purpose" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_valid_block_height" bigint NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"kind" text NOT NULL,
	"asset_mint" text NOT NULL,
	"asset_decimals" integer NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"source" text NOT NULL,
	"destination" text NOT NULL,
	"launch_mint" text,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_slot_idx" ON "ledger_entries" USING btree ("slot");--> statement-breakpoint
CREATE INDEX "ledger_entries_kind_source_idx" ON "ledger_entries" USING btree ("kind","source");--> statement-breakpoint
-- The Ledger is append-only: a published entry can never be changed or taken back.
CREATE FUNCTION "ledger_entries_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_entries_append_only"();
