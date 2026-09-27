import { bigint, doublePrecision, index, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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

/** One row per trade on a curve of our platform, written by the Indexer from the program's TradeEvent. */
export const trades = pgTable(
  "trades",
  {
    signature: text("signature").notNull(),
    /** Position among the trades in the transaction. */
    eventIndex: integer("event_index").notNull(),
    mint: text("mint").notNull(),
    trader: text("trader").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    /** Coins bought or sold, raw units. */
    baseAmount: numeric("base_amount", { precision: 40, scale: 0 }).notNull(),
    /** Quote Asset paid including fees (buy) or received after fees (sell), raw units. */
    quoteAmount: numeric("quote_amount", { precision: 40, scale: 0 }).notNull(),
    protocolFee: numeric("protocol_fee", { precision: 40, scale: 0 }).notNull(),
    platformFee: numeric("platform_fee", { precision: 40, scale: 0 }).notNull(),
    creatorFee: numeric("creator_fee", { precision: 40, scale: 0 }).notNull(),
    /** Price of one whole coin in whole Quote Asset units, just before and just after the trade. */
    priceBefore: doublePrecision("price_before").notNull(),
    priceAfter: doublePrecision("price_after").notNull(),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.signature, t.eventIndex] }), index("trades_mint_slot_idx").on(t.mint, t.slot)],
);

/**
 * One row per Creator Fee claim by a Creator of our platform, written by the Indexer from the claim transaction: the
 * public history of what each Creator has taken out of their Creator Fee vaults.
 */
export const creatorFeeClaims = pgTable(
  "creator_fee_claims",
  {
    signature: text("signature").notNull(),
    /** Position among the claims in the transaction. */
    eventIndex: integer("event_index").notNull(),
    creator: text("creator").notNull(),
    quoteMint: text("quote_mint").notNull(),
    quoteDecimals: integer("quote_decimals").notNull(),
    /** Raw units of the Quote Asset paid out of the vault. */
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.eventIndex] }),
    index("creator_fee_claims_creator_slot_idx").on(t.creator, t.slot),
  ],
);

/** The latest indexed state of each Launch's curve: what it has raised toward its Graduation Target, and its price. */
export const curves = pgTable("curves", {
  mint: text("mint").primaryKey(),
  /** Quote Asset raised so far, raw units, fees excluded. */
  realQuote: numeric("real_quote", { precision: 40, scale: 0 }).notNull(),
  /** Coins sold so far, raw units. */
  realBase: numeric("real_base", { precision: 40, scale: 0 }).notNull(),
  price: doublePrecision("price").notNull(),
  status: text("status", { enum: ["live", "graduating", "graduated"] }).notNull(),
  /** Slot of the trade this state is from. */
  slot: bigint("slot", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The Quote Registry: one row per Quote Asset (a quote mint with a LaunchLab GlobalConfig), rewritten by the scheduled refresh.
 * The price and Graduation Target are as of `pricedAt`; the rule band mirrors our on-chain curve rule once the refresh has written it.
 */
export const quoteAssets = pgTable("quote_assets", {
  mint: text("mint").primaryKey(),
  globalConfig: text("global_config").notNull().unique(),
  tokenProgram: text("token_program").notNull(),
  decimals: integer("decimals").notNull(),
  symbol: text("symbol"),
  name: text("name"),
  logo: text("logo"),
  /** Null when no source gives a reliable price. */
  priceUsd: numeric("price_usd"),
  priceSol: numeric("price_sol"),
  pricedAt: timestamp("priced_at", { withTimezone: true }),
  /** Raw units of the Quote Asset worth the Graduation Target in SOL at `pricedAt`. */
  graduationTarget: numeric("graduation_target", { precision: 40, scale: 0 }),
  /** The Graduation Targets our curve rule accepts; null while the rule is closed. */
  ruleMin: numeric("rule_min", { precision: 40, scale: 0 }),
  ruleMax: numeric("rule_max", { precision: 40, scale: 0 }),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull(),
});
