CREATE TABLE "graduations" (
	"mint" text PRIMARY KEY NOT NULL,
	"pool" text NOT NULL,
	"signature" text NOT NULL,
	"slot" bigint NOT NULL,
	"graduated_at" timestamp with time zone NOT NULL,
	"price" double precision,
	"price_slot" bigint,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graduations_pool_unique" UNIQUE("pool")
);
--> statement-breakpoint
CREATE TABLE "operator_alerts" (
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "operator_alerts_kind_subject_pk" PRIMARY KEY("kind","subject")
);
--> statement-breakpoint
ALTER TABLE "curves" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "venue" text DEFAULT 'curve' NOT NULL;