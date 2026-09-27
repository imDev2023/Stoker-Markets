import { bigint, index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** One row per Launch on our platform, written by the Indexer from the launch transaction. */
export const launches = pgTable(
  "launches",
  {
    mint: text("mint").primaryKey(),
    pool: text("pool").notNull().unique(),
    creator: text("creator").notNull(),
    quoteMint: text("quote_mint").notNull(),
    globalConfig: text("global_config").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    metadataUri: text("metadata_uri").notNull(),
    decimals: integer("decimals").notNull(),
    supply: numeric("supply", { precision: 40, scale: 0 }).notNull(),
    totalBaseSell: numeric("total_base_sell", { precision: 40, scale: 0 }).notNull(),
    graduationTarget: numeric("graduation_target", { precision: 40, scale: 0 }).notNull(),
    createdSignature: text("created_signature").notNull(),
    createdSlot: bigint("created_slot", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("launches_created_slot_idx").on(t.createdSlot), index("launches_creator_idx").on(t.creator)],
);

/** Launch metadata we host (name, description, links, image), keyed by the id in the metadata URI. */
export const launchMetadata = pgTable("launch_metadata", {
  id: text("id").primaryKey(),
  creator: text("creator").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description").notNull(),
  imageKey: text("image_key").notNull(),
  imageContentType: text("image_content_type").notNull(),
  website: text("website"),
  x: text("x"),
  telegram: text("telegram"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
