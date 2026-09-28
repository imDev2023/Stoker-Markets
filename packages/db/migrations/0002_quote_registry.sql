CREATE TABLE "quote_assets" (
	"mint" text PRIMARY KEY NOT NULL,
	"global_config" text NOT NULL,
	"token_program" text NOT NULL,
	"decimals" integer NOT NULL,
	"symbol" text,
	"name" text,
	"logo" text,
	"price_usd" numeric,
	"price_sol" numeric,
	"priced_at" timestamp with time zone,
	"graduation_target" numeric(40, 0),
	"rule_min" numeric(40, 0),
	"rule_max" numeric(40, 0),
	"refreshed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quote_assets_global_config_unique" UNIQUE("global_config")
);
