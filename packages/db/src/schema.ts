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
  (t) => [
    index("launches_created_slot_idx").on(t.createdSlot),
    index("launches_creator_idx").on(t.creator),
    index("launches_quote_mint_idx").on(t.quoteMint),
  ],
);

/**
 * Each Launch's latest price wherever it trades, for the board's market caps: the curve's starting price when the Launch
 * is indexed, then the price after each newer trade, on the curve or in its pool after Graduation.
 */
export const launchMarkets = pgTable("launch_markets", {
  mint: text("mint").primaryKey(),
  /** Price of one whole coin in whole Quote Asset units. */
  price: doublePrecision("price").notNull(),
  /** Slot of the launch or trade the price is from; an earlier one never replaces it. */
  priceSlot: bigint("price_slot", { mode: "number" }).notNull(),
  /** Null until the first trade. */
  lastTradeAt: timestamp("last_trade_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/**
 * One row per trade of a Launch's coin: on its curve (from LaunchLab's TradeEvent) and, after Graduation, in its CPMM
 * pool (from CPMM's SwapEvent).
 */
export const trades = pgTable(
  "trades",
  {
    signature: text("signature").notNull(),
    /** Position among the trades in the transaction. */
    eventIndex: integer("event_index").notNull(),
    mint: text("mint").notNull(),
    /** Where the trade happened: the Launch's curve, or its CPMM pool after Graduation. */
    venue: text("venue", { enum: ["curve", "pool"] }).notNull().default("curve"),
    trader: text("trader").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    /** Coins bought or sold, raw units. */
    baseAmount: numeric("base_amount", { precision: 40, scale: 0 }).notNull(),
    /** Quote Asset paid including fees (buy) or received after fees (sell), raw units. */
    quoteAmount: numeric("quote_amount", { precision: 40, scale: 0 }).notNull(),
    /** Raydium's fee: in the Quote Asset, except on a pool sell, where the pool takes it from the coins sold. */
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
  (t) => [
    primaryKey({ columns: [t.signature, t.eventIndex] }),
    index("trades_mint_slot_idx").on(t.mint, t.slot),
    // The board's trending sort sums the last day's trades.
    index("trades_block_time_idx").on(t.blockTime),
  ],
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
  /** When the buy that sold the curve out landed: from then on the Launch waits for Raydium to migrate it. */
  completedAt: timestamp("completed_at", { withTimezone: true }),
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
  /** What kind of asset it is, for filtering the board: from its mint address or its issuer's authorities. */
  category: text("category", { enum: ["sol", "stablecoin", "tokenized_stock", "community"] }).notNull().default("community"),
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

/** One row per graduated Launch: Raydium's migration of its curve into a CPMM pool, and the pool's latest price. */
export const graduations = pgTable("graduations", {
  mint: text("mint").primaryKey(),
  /** The CPMM pool the Launch trades in after Graduation. */
  pool: text("pool").notNull().unique(),
  signature: text("signature").notNull(),
  slot: bigint("slot", { mode: "number" }).notNull(),
  graduatedAt: timestamp("graduated_at", { withTimezone: true }).notNull(),
  /** Price of one whole coin in whole Quote Asset units after the latest indexed pool trade; null before the first. */
  price: doublePrecision("price"),
  /** Slot of the pool trade the price is from. */
  priceSlot: bigint("price_slot", { mode: "number" }),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Something the operator must act on, raised once per subject and resolved when the cause goes away, such as a Launch
 * whose curve sold out but that Raydium has not migrated.
 */
export const operatorAlerts = pgTable(
  "operator_alerts",
  {
    kind: text("kind", { enum: ["graduation_stuck"] }).notNull(),
    /** What the alert is about, such as a Launch's mint. */
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the alert reached the alert webhook; retried every run until it does. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.kind, t.subject] })],
);

/**
 * What a Creator asked for when a launch was prepared, kept so a retry rebuilds the same launch for the same coin
 * address and so can never create a second coin. One row per prepared coin, whether or not it ever launched.
 */
export const launchDrafts = pgTable(
  "launch_drafts",
  {
    mint: text("mint").primaryKey(),
    creator: text("creator").notNull(),
    /** With the API's MINT_KEY_SECRET this derives the mint key, so the key itself is never stored. */
    mintKeyNonce: text("mint_key_nonce").notNull(),
    quoteMint: text("quote_mint").notNull(),
    globalConfig: text("global_config").notNull(),
    /** Raw units of the Quote Asset, fixed from its price when the launch was first prepared; a retry keeps it. */
    graduationTarget: numeric("graduation_target", { precision: 40, scale: 0 }).notNull(),
    /** The SOL, in lamports, that Graduation Target was worth then. */
    graduationTargetLamports: numeric("graduation_target_lamports", { precision: 40, scale: 0 }).notNull(),
    /** Quote Asset the Creator spends on the first buy, raw units; null without one. */
    firstBuy: numeric("first_buy", { precision: 40, scale: 0 }),
    /** Newest transaction of the Creator's coin account already scanned for airdrop payments. */
    airdropScannedUntil: text("airdrop_scanned_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("launch_drafts_creator_idx").on(t.creator)],
);

/** One row per wallet an airdrop pays: what it gets, and whether it has been paid. */
export const airdropRecipients = pgTable(
  "airdrop_recipients",
  {
    mint: text("mint").notNull(),
    wallet: text("wallet").notNull(),
    /** Order in the Creator's list. */
    position: integer("position").notNull(),
    /** Coins, raw units. */
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    /**
     * The last block height at which a transaction already handed out to pay this wallet can still land. No new one is
     * handed out until the chain has passed it, so a wallet is never paid twice.
     */
    sendableUntil: bigint("sendable_until", { mode: "number" }),
    paidSignature: text("paid_signature"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.mint, t.wallet] })],
);
