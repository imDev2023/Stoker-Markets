CREATE TABLE "rebate_weeks" (
	"week_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"week_end" timestamp with time zone NOT NULL,
	"cap_bps" integer NOT NULL,
	"budget" numeric(40, 0) NOT NULL,
	"fees" numeric(40, 0) NOT NULL,
	"pot" numeric(40, 0) NOT NULL,
	"traders" integer NOT NULL,
	"credited" numeric(40, 0) NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebates" (
	"week_start" timestamp with time zone NOT NULL,
	"wallet" text NOT NULL,
	"fees" numeric(40, 0) NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"signature" text,
	"sendable_until" bigint,
	"paid_at" timestamp with time zone,
	CONSTRAINT "rebates_week_start_wallet_pk" PRIMARY KEY("week_start","wallet")
);
--> statement-breakpoint
CREATE INDEX "rebates_wallet_idx" ON "rebates" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "rebates_status_idx" ON "rebates" USING btree ("status");