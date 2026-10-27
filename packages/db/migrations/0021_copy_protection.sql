ALTER TABLE "launch_metadata" ADD COLUMN "image_hash" text;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "name_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "symbol_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "image_hash" text;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "copy_of" text;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "copy_kind" text;--> statement-breakpoint
CREATE INDEX "launches_name_key_idx" ON "launches" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "launches_symbol_key_idx" ON "launches" USING btree ("symbol_key");--> statement-breakpoint
-- Launches indexed before Copy Protection get a plain key (letters and digits, upper case) so they are protected from here
-- on; the API folds new launches further (lookalike letters, leetspeak, claim words) when it indexes them.
UPDATE "launches" SET "name_key" = upper(regexp_replace("name", '[^A-Za-z0-9]', '', 'g')), "symbol_key" = upper(regexp_replace("symbol", '[^A-Za-z0-9]', '', 'g')) WHERE "name_key" = '';
