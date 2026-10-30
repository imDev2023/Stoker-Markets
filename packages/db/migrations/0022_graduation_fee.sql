ALTER TABLE "graduations" ADD COLUMN "fee_lamports" numeric(40, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "graduations" ADD COLUMN "fee_withheld" numeric(40, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "graduations" ADD COLUMN "fee_paid_lamports" numeric(40, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "graduations" ADD COLUMN "fee_settled_at" timestamp with time zone;