import { sql } from "drizzle-orm";
import { bigint, boolean, check, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { HoldingWeightStep, QuoteLabel } from "@launchpad/contract";

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
    /** A Reward Launch's Reward Tax in basis points (100, 200, 300, 400 or 500); null for a standard coin. */
    rewardTaxBps: integer("reward_tax_bps"),
    /**
     * A Reward Launch's Payout Asset (ADR 0006, #43): its Holder Rewards are paid in the coin itself, or in its Quote
     * Asset, bought with the tax through Reward Sales. Copied from the launch draft when the launch is indexed and never
     * changed; a Reward Launch made without our API pays in the coin. Null for a standard coin.
     */
    rewardPayout: text("reward_payout", { enum: ["coin", "quote"] }),
    /**
     * A Reward Launch's Reward Burn (#183, ADR 0006): the share of every harvested Reward Tax the Reward Engine burns
     * before it sells or pays anything, in basis points (0, 1000, 2500 or 5000). Copied from the launch draft when the
     * launch is indexed and never changed; a Reward Launch made without our API burns nothing (0). Null for a standard coin.
     */
    rewardBurnBps: integer("reward_burn_bps"),
    /**
     * Where the Creator's earnings on the coin go (ADR 0011, #113, #184): their wallet, the coin's holders, a buyback
     * that burns the coin, or a buyback that adds locked liquidity to its pool. Copied from the launch draft when the
     * launch is indexed and never changed; a coin launched without our API pays the wallet.
     */
    earningsDestination: text("earnings_destination", { enum: ["wallet", "holders", "burn", "liquidity"] }).notNull().default("wallet"),
    /**
     * The transaction in which the operations wallet gave up the coin's transfer-fee-config authority for good, once
     * Raydium's migration handed it over; from then on nobody can change the Reward Tax. Null until then.
     */
    rewardTaxLockedSignature: text("reward_tax_locked_signature"),
    rewardTaxLockedAt: timestamp("reward_tax_locked_at", { withTimezone: true }),
    /**
     * Copy Protection (#120, ADR 0012): the coin's name and ticker folded to their core keys (`apps/api/src/copies/keys.ts`),
     * so a copy that swaps in lookalike letters, leetspeak or a claim like "official" still matches; and the perceptual
     * hash of its image (16 hex digits), null when the image was not ours to hash or too small. Set when the launch is
     * indexed, from the on-chain name and symbol, and never changed.
     */
    nameKey: text("name_key").notNull().default(""),
    symbolKey: text("symbol_key").notNull().default(""),
    imageHash: text("image_hash"),
    /**
     * The protected launch this one copied, when it landed as a copy anyway (a race inside the window, or a launch made
     * without our API): shown as a label on the coin, never a reason to hide it. Null for an original.
     */
    copyOf: text("copy_of"),
    copyKind: text("copy_kind", { enum: ["ticker", "name", "image", "near"] }),
    createdSignature: text("created_signature").notNull(),
    createdSlot: bigint("created_slot", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("launches_created_slot_idx").on(t.createdSlot),
    index("launches_creator_idx").on(t.creator),
    index("launches_quote_mint_idx").on(t.quoteMint),
    index("launches_name_key_idx").on(t.nameKey),
    index("launches_symbol_key_idx").on(t.symbolKey),
    check("launches_reward_burn_bps", sql`${t.rewardBurnBps} between 0 and 5000`),
  ],
).enableRLS();

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
}).enableRLS();

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
  discord: text("discord"),
  tiktok: text("tiktok"),
  instagram: text("instagram"),
  youtube: text("youtube"),
  /** The image's perceptual hash (Copy Protection, #120), computed at prepare time; null when the picture can't be hashed. */
  imageHash: text("image_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

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
    /** The share fee a referred curve trade paid its referrer, in the Quote Asset; 0 on an unreferred trade. */
    shareFee: numeric("share_fee", { precision: 40, scale: 0 }).notNull().default("0"),
    /** The wallet the share fee went to; null on an unreferred trade. */
    referrer: text("referrer"),
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
).enableRLS();

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
}).enableRLS();

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
  /** What kind of asset it is (ADR 0010), for the board's filters and the assets page: from its mint address and authorities, and Jupiter's tags. */
  category: text("category", { enum: ["sol", "stablecoin", "tokenized_stock", "rwa", "wrapped", "defi", "leveraged", "collectible", "meme", "community"] }).notNull().default("community"),
  /** Which issuer a tokenized stock is from, by the authorities on its mint; null for every other kind. */
  issuer: text("issuer", { enum: ["xstocks", "prestocks", "tessera", "backpack"] }),
  /** Null when no source gives a reliable price. */
  priceUsd: numeric("price_usd"),
  priceSol: numeric("price_sol"),
  pricedAt: timestamp("priced_at", { withTimezone: true }),
  /** Raw units of the Quote Asset worth the Graduation Target in SOL at `pricedAt`. */
  graduationTarget: numeric("graduation_target", { precision: 40, scale: 0 }),
  /** The Graduation Targets our curve rule accepts; null while the rule is closed. */
  ruleMin: numeric("rule_min", { precision: 40, scale: 0 }),
  ruleMax: numeric("rule_max", { precision: 40, scale: 0 }),
  /** The GlobalConfig's `max_share_fee_rate` (1e6 denominator): the most a referred trade may pay its referrer; 0 on most. */
  maxShareFeeRate: bigint("max_share_fee_rate", { mode: "number" }).notNull().default(0),
  /** The token list's USD liquidity for the mint at the last refresh, null when the list doesn't know it: how prominent an asset is, for the chooser's order. */
  liquidityUsd: doublePrecision("liquidity_usd"),
  /**
   * Quote Risk Labels (#11), as the API shows them; null until the mint has been checked. `labelsSlot` is the slot the
   * mint was read at, so a read from an older slot never overwrites a newer one.
   */
  labels: jsonb("labels").$type<QuoteLabel[]>(),
  labelsSlot: bigint("labels_slot", { mode: "number" }),
  labelsCheckedAt: timestamp("labels_checked_at", { withTimezone: true }),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull(),
}).enableRLS();

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
  /** The newest of the pool's transactions the pool backfill has read; the next pass resumes after it. Null before the first. */
  backfilledUntil: text("backfilled_until"),
  /** When the pool backfill made its last pass: the pool's trades arrive through the webhook alone from then on. Null while it runs. */
  backfillClosedAt: timestamp("backfill_closed_at", { withTimezone: true }),
  /**
   * The Graduation Fee (ADR 0015): what the platform charges for this Graduation, in lamports, as `GRADUATION_FEE_LAMPORTS`
   * stood when it was indexed; 0 for one indexed before the fee existed, which is never charged.
   */
  feeLamports: numeric("fee_lamports", { precision: 40, scale: 0 }).notNull().default("0"),
  /** What has been withheld toward it from the Creator's share, in raw units of the Launch's Quote Asset. */
  feeWithheld: numeric("fee_withheld", { precision: 40, scale: 0 }).notNull().default("0"),
  /** The worth of that in lamports at the Quote Registry's price at each withholding; the fee is settled once it reaches `feeLamports`. */
  feePaidLamports: numeric("fee_paid_lamports", { precision: 40, scale: 0 }).notNull().default("0"),
  /** When the fee was withheld in full; null while any of it is still owed. */
  feeSettledAt: timestamp("fee_settled_at", { withTimezone: true }),
  /**
   * The coin's Active Days (ADR 0020) as the Fee Collector last counted them, before it collected: the days on which the
   * pool traded at least the ladder's floor. Every page reads this figure; a coin on the top tier is no longer counted.
   */
  activeDays: integer("active_days").notNull().default(0),
}).enableRLS();

/**
 * Something the operator must act on, raised once per subject and resolved when the cause goes away, such as a Launch
 * whose curve sold out but that Raydium has not migrated.
 */
export const operatorAlerts = pgTable(
  "operator_alerts",
  {
    kind: text("kind", { enum: ["graduation_stuck", "reward_tax_unlocked", "job_failed", "reward_round_stalled"] }).notNull(),
    /** What the alert is about, such as a Launch's mint, a job's name or a round's id. */
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the alert reached the alert webhook; retried every run until it does. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.kind, t.subject] })],
).enableRLS();

/**
 * What a Creator asked for when a launch was prepared, kept so a retry rebuilds the same launch for the same coin
 * address and so can never create a second coin. One row per prepared coin, whether or not it ever launched.
 */
export const launchDrafts = pgTable(
  "launch_drafts",
  {
    mint: text("mint").primaryKey(),
    creator: text("creator").notNull(),
    /** With the API's MINT_KEY_SECRET this derives the mint key, so the key itself is never stored; null when the draft
     * launches with a key the operator chose (`chosen_mint_keys`). */
    mintKeyNonce: text("mint_key_nonce"),
    quoteMint: text("quote_mint").notNull(),
    globalConfig: text("global_config").notNull(),
    /** Raw units of the Quote Asset, fixed from its price when the launch was first prepared; a retry keeps it. */
    graduationTarget: numeric("graduation_target", { precision: 40, scale: 0 }).notNull(),
    /** The SOL, in lamports, that Graduation Target was worth then. */
    graduationTargetLamports: numeric("graduation_target_lamports", { precision: 40, scale: 0 }).notNull(),
    /** Quote Asset the Creator spends on the first buy, raw units; null without one. */
    firstBuy: numeric("first_buy", { precision: 40, scale: 0 }),
    /** The Reward Tax the Creator chose, in basis points; null for a standard Launch. */
    rewardTaxBps: integer("reward_tax_bps"),
    /** The Payout Asset the Creator chose for a Reward Launch; null for a standard Launch. */
    rewardPayout: text("reward_payout", { enum: ["coin", "quote"] }),
    /** The Reward Burn the Creator chose for a Reward Launch, basis points of every harvest (#183); null for a standard Launch. */
    rewardBurnBps: integer("reward_burn_bps"),
    /** Where the Creator chose their earnings on the coin to go (ADR 0011). */
    earningsDestination: text("earnings_destination", { enum: ["wallet", "holders", "burn", "liquidity"] }).notNull().default("wallet"),
    /** Newest transaction of the Creator's coin account already scanned for airdrop payments. */
    airdropScannedUntil: text("airdrop_scanned_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("launch_drafts_creator_idx").on(t.creator), check("launch_drafts_reward_burn_bps", sql`${t.rewardBurnBps} between 0 and 5000`)],
).enableRLS();

/**
 * Mint keys the operator chose for a Creator's next launch (a ground vanity address, #75), one used per draft in the order
 * stored. The secret key is AES-256-GCM under a key derived from MINT_KEY_SECRET: base64 of the 12-byte iv, then the ciphertext.
 */
export const chosenMintKeys = pgTable(
  "chosen_mint_keys",
  {
    mint: text("mint").primaryKey(),
    creator: text("creator").notNull(),
    secret: text("secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chosen_mint_keys_creator_idx").on(t.creator)],
).enableRLS();

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
).enableRLS();

/**
 * The Ledger: the append-only public record of platform revenue, one row per movement in a confirmed transaction, such as
 * a Platform Fee claim, a pool creator fee or Fee Key collection, or a sweep to the treasury. Rows are only ever inserted,
 * keyed by transaction signature, so a retried job or a replayed transaction never records anything twice.
 * `kind` is open text so later jobs (Reward Rounds, Burns, Flywheel buys) add their own kinds without a migration.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    signature: text("signature").notNull(),
    /** Position among the movements in the transaction. */
    eventIndex: integer("event_index").notNull(),
    /** platform_fee, pool_fee, fee_key, sweep, creator_forward, burn, flywheel, arweave_top_up, metadata_upload, reward_sale, graduation_fee, holder_dividend, creator_burn, creator_liquidity, rebate or reward_burn so far. */
    kind: text("kind").notNull(),
    /** What moved: a Quote Asset or a coin; SOL as the wrapped-SOL mint. */
    assetMint: text("asset_mint").notNull(),
    assetDecimals: integer("asset_decimals").notNull(),
    /** Raw units that moved. */
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    /** Where it came from: a Platform Fee vault, a CPMM pool, or the operations wallet. */
    source: text("source").notNull(),
    /** Where it went: the operations wallet, the treasury for a sweep, or the Creator for a Creator Forward. */
    destination: text("destination").notNull(),
    /** The Launch it came from, when one did: a graduated coin's pool fees and Fee Key. A Platform Fee vault pools every Launch. */
    launchMint: text("launch_mint"),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.eventIndex] }),
    index("ledger_entries_slot_idx").on(t.slot),
    index("ledger_entries_kind_source_idx").on(t.kind, t.source),
  ],
).enableRLS();

/**
 * Every transaction a scheduled job signs, written before it is sent: a job that dies between sending and recording finds
 * its transaction here on the next run and records what landed, so nothing it moved is missing from the Ledger.
 */
export const jobTransactions = pgTable("job_transactions", {
  signature: text("signature").primaryKey(),
  job: text("job").notNull(),
  /** What the transaction does, such as a revenue kind. */
  purpose: text("purpose").notNull(),
  /** The account it acts on: a fee vault, a pool, a locked position's Fee Key, or the treasury. */
  subject: text("subject").notNull(),
  status: text("status", { enum: ["pending", "landed", "failed", "expired"] }).notNull().default("pending"),
  /** Past this block height an unconfirmed transaction can never land. */
  lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}).enableRLS();

/**
 * The Creator Forward (ADR 0009): one row per payment of a Creator's share of platform revenue in one Quote Asset,
 * written with its transaction's signature before the transaction is sent. What a Creator is owed is what they earned
 * less every row that is `sending` or `paid`, so a run that dies, or a retry, never pays the same share twice; only a
 * `failed` or `expired` row frees its amount to be paid again.
 */
export const creatorForwards = pgTable(
  "creator_forwards",
  {
    signature: text("signature").primaryKey(),
    creator: text("creator").notNull(),
    /** The Quote Asset paid; SOL as the wrapped-SOL mint, though it is paid as plain SOL. */
    assetMint: text("asset_mint").notNull(),
    assetDecimals: integer("asset_decimals").notNull(),
    /** Raw units sent. A Token-2022 transfer fee, if the asset has one, is withheld from it on the way. */
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    status: text("status", { enum: ["sending", "paid", "failed", "expired"] }).notNull().default("sending"),
    /** Past this block height an unconfirmed transaction can never land. */
    lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the transaction landed, by the chain's clock; null until it has. */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("creator_forwards_creator_idx").on(t.creator, t.assetMint), index("creator_forwards_status_idx").on(t.status)],
).enableRLS();

/** One row per run of a scheduled job: when it ran, how it ended, and what it did, for the operator. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    job: text("job").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed", "skipped"] }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** What the run did, as the job reports it. */
    summary: jsonb("summary"),
    error: text("error"),
  },
  (t) => [index("job_runs_job_started_idx").on(t.job, t.startedAt)],
).enableRLS();

/** A lease on a job, so two runs of it (a Cron Trigger and a manual one) never overlap. It lapses if its holder dies. */
export const jobLocks = pgTable("job_locks", {
  job: text("job").primaryKey(),
  runId: text("run_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}).enableRLS();

/**
 * The published rules Reward Rounds follow, one row per version: who counts as a holder and when a round runs. A
 * version is announced first and takes effect later, so a change never surprises a holder; a round follows the version
 * in force at its snapshot.
 */
export const rewardRules = pgTable("reward_rules", {
  version: integer("version").primaryKey(),
  /** The least a wallet must hold at the snapshot to be paid, raw units of the coin. */
  minHolding: numeric("min_holding", { precision: 40, scale: 0 }).notNull(),
  /** A round runs once at least this much tax has collected, raw units of the coin. */
  roundThreshold: numeric("round_threshold", { precision: 40, scale: 0 }).notNull(),
  /**
   * The Holding Weight's steps (ADR 0022), shortest first: a coin whose Holding Lot is `afterDays` Holding Days old
   * counts `weightBps` in a round. Empty, as in every version from before the ADR, when every coin counts once.
   */
  holdingWeights: jsonb("holding_weights").$type<HoldingWeightStep[]>().notNull().default([]),
  note: text("note"),
  announcedAt: timestamp("announced_at", { withTimezone: true }).notNull().defaultNow(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
}).enableRLS();

/**
 * The Budget Table (ADR 0019), one row per version: how the Platform Net (the Ledger's revenue less the Creators'
 * share) is divided between the Burn, the Flywheel, the trader programs and the treasury, each share in basis points.
 * A version is announced first and takes effect later, and its shares apply to the net collected while it is in force.
 * The shares of a version sum to 100%, which Postgres itself checks.
 */
export const budgetTables = pgTable(
  "budget_tables",
  {
    version: integer("version").primaryKey(),
    burnBps: integer("burn_bps").notNull(),
    flywheelBps: integer("flywheel_bps").notNull(),
    /** Volume rebates to traders; 0 until the program is built. */
    rebatesBps: integer("rebates_bps").notNull(),
    /** The off-chain referral program for every pair; 0 until it is built. */
    referralsBps: integer("referrals_bps").notNull(),
    /** The integrator share; 0 until it is built. */
    integratorsBps: integer("integrators_bps").notNull(),
    /** The remainder, which the sweep moves to the Treasury; written out so that a mistake in another row fails the sum. */
    treasuryBps: integer("treasury_bps").notNull(),
    note: text("note"),
    announcedAt: timestamp("announced_at", { withTimezone: true }).notNull().defaultNow(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "budget_tables_shares_sum",
      sql`${t.burnBps} + ${t.flywheelBps} + ${t.rebatesBps} + ${t.referralsBps} + ${t.integratorsBps} + ${t.treasuryBps} = 10000`,
    ),
    check(
      "budget_tables_shares_not_negative",
      sql`${t.burnBps} >= 0 and ${t.flywheelBps} >= 0 and ${t.rebatesBps} >= 0 and ${t.referralsBps} >= 0 and ${t.integratorsBps} >= 0 and ${t.treasuryBps} >= 0`,
    ),
  ],
).enableRLS();

/**
 * The Creator Ladder (ADR 0020), one row per version: the share of a graduated coin's pool creator fee collections that
 * is its Creator's, by the coin's Creator Tier. The first tier is the floor, half (ADR 0009), on the curve and after
 * Graduation; a coin reaches the second and the top tier by its Active Days, the days on which its pool traded at
 * least `activeDayFloorBps` of its Graduation Target. A version is announced first and takes effect later, and its
 * shares apply to the pool fees collected while it is in force. Postgres itself checks that the ladder climbs.
 */
export const creatorLadders = pgTable(
  "creator_ladders",
  {
    version: integer("version").primaryKey(),
    /** The second tier: the Creator's share of a pool fee collection in basis points, and the Active Days that reach it. */
    secondBps: integer("second_bps").notNull(),
    secondActiveDays: integer("second_active_days").notNull(),
    /** The top tier. */
    topBps: integer("top_bps").notNull(),
    topActiveDays: integer("top_active_days").notNull(),
    /** The least a pool must trade in a day for the day to count, in basis points of the coin's own Graduation Target. */
    activeDayFloorBps: integer("active_day_floor_bps").notNull(),
    note: text("note"),
    announcedAt: timestamp("announced_at", { withTimezone: true }).notNull().defaultNow(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("creator_ladders_shares_climb", sql`${t.secondBps} > 5000 and ${t.topBps} > ${t.secondBps} and ${t.topBps} <= 10000`),
    check("creator_ladders_days_climb", sql`${t.secondActiveDays} >= 1 and ${t.topActiveDays} > ${t.secondActiveDays}`),
    check("creator_ladders_floor", sql`${t.activeDayFloorBps} >= 1 and ${t.activeDayFloorBps} <= 10000`),
  ],
).enableRLS();

/**
 * The Creator Tiers a graduated coin has reached above the first (ADR 0020): one row per coin and tier, written once by
 * the Fee Collector when the coin's Active Days reach the tier under the ladder in force, and never changed or removed,
 * so a coin's tier only ever climbs. The tier's share applies to the pool fees collected after `reachedSlot`.
 */
export const creatorTiers = pgTable(
  "creator_tiers",
  {
    mint: text("mint").notNull(),
    /** 2 for the second tier, 3 for the top. Every coin is on the first from its launch, without a row. */
    tier: integer("tier").notNull(),
    /** The coin's Active Days when the tier was recorded. */
    activeDays: integer("active_days").notNull(),
    /** The ladder version whose rule the coin met. */
    ladderVersion: integer("ladder_version").notNull(),
    /** The chain's confirmed slot when the tier was recorded: a pool fee collection in a later slot earns the tier's share. */
    reachedSlot: bigint("reached_slot", { mode: "number" }).notNull(),
    reachedAt: timestamp("reached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.tier] }), check("creator_tiers_tier", sql`${t.tier} in (2, 3)`)],
).enableRLS();

/**
 * Rebate Weeks (ADR 0021): one row per week of the volume rebates that has been settled, written once with every
 * Volume Rebate it gave. The week's pot is what the Budget Table's `rebates` row had left when the week was settled,
 * less the rebates of earlier weeks still to be paid, and never more than `capBps` of the fees the week's trades paid;
 * it is split among the traders in proportion to those fees. Everything is in lamports.
 */
export const rebateWeeks = pgTable("rebate_weeks", {
  /** The week's start: a Monday 00:00 UTC everywhere but a test stack, which shortens the week. */
  weekStart: timestamp("week_start", { withTimezone: true }).primaryKey(),
  weekEnd: timestamp("week_end", { withTimezone: true }).notNull(),
  /** The largest share the `rebates` row had in force during the week, in basis points: the most of the fees a rebate may be. */
  capBps: integer("cap_bps").notNull(),
  /** What the row had left at the settlement, less the rebates of earlier weeks not yet paid. */
  budget: numeric("budget", { precision: 40, scale: 0 }).notNull(),
  /** The Platform Fees the week's earning trades paid, valued in SOL at the Quote Registry's prices at the settlement. */
  fees: numeric("fees", { precision: 40, scale: 0 }).notNull(),
  /** What the week splits: the budget, or the cap's share of the fees where that is less. */
  pot: numeric("pot", { precision: 40, scale: 0 }).notNull(),
  /** The wallets given a rebate. */
  traders: integer("traders").notNull(),
  /** What the rebates add up to; rounding leaves the pot's last lamports in the row. */
  credited: numeric("credited", { precision: 40, scale: 0 }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * Volume Rebates (ADR 0021): one trader's rebate for one Rebate Week, written with the week. It waits until the
 * wallet's waiting rebates together reach the minimum payout, then they are paid in one SOL transfer: marked `sending`
 * with the transaction's signature before it goes out, so a run that dies never lets the next one pay them twice, and
 * `paid` once it has landed and is on the Ledger. A transaction that fails or expires puts its rebates back to waiting.
 */
export const rebates = pgTable(
  "rebates",
  {
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    wallet: text("wallet").notNull(),
    /** The Platform Fees the wallet's trades paid in the week, valued in SOL like the week's total, in lamports. */
    fees: numeric("fees", { precision: 40, scale: 0 }).notNull(),
    /** The rebate, in lamports. */
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    status: text("status", { enum: ["waiting", "sending", "paid"] }).notNull().default("waiting"),
    signature: text("signature"),
    /** Past this block height the transaction handed out for this rebate can never land. */
    sendableUntil: bigint("sendable_until", { mode: "number" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.weekStart, t.wallet] }), index("rebates_wallet_idx").on(t.wallet), index("rebates_status_idx").on(t.status)],
).enableRLS();

/** One Reward Round of one Reward Launch: its snapshot, the pot it pays out, and how far it has got. */
export const rewardRounds = pgTable(
  "reward_rounds",
  {
    id: text("id").primaryKey(),
    mint: text("mint").notNull(),
    rulesVersion: integer("rules_version").notNull(),
    status: text("status", { enum: ["paying", "paid"] }).notNull(),
    /**
     * What the round pays out (ADR 0011): `tax`, a Reward Launch's collected Reward Tax, or `earnings`, the Creator's
     * share of platform revenue on a coin whose earnings go to its holders. A coin may have one round of each paying
     * at a time, and each has its own pot.
     */
    source: text("source", { enum: ["tax", "earnings"] }).notNull().default("tax"),
    snapshotSlot: bigint("snapshot_slot", { mode: "number" }).notNull(),
    /** The Payout Asset the round pays in: the coin's mint, or the Quote Asset's (SOL as the wrapped-SOL mint, paid as plain SOL). */
    payoutMint: text("payout_mint").notNull(),
    payoutDecimals: integer("payout_decimals").notNull(),
    /**
     * What the round pays out, raw units of the Payout Asset: for a coin payout the collected tax in the operations
     * wallet's account of the coin at the snapshot; for a Quote Asset payout what the Reward Sales brought in and no
     * earlier round paid.
     */
    pot: numeric("pot", { precision: 40, scale: 0 }).notNull(),
    /** For a Quote Asset payout, the coins of tax sold for this pot (the threshold is measured in coins); null for a coin payout. */
    sold: numeric("sold", { precision: 40, scale: 0 }),
    eligibleHolders: integer("eligible_holders").notNull(),
    /** What the payouts add up to; rounding leaves the pot's last units for the next round. */
    distributable: numeric("distributable", { precision: 40, scale: 0 }).notNull(),
    /**
     * The Weighted Holdings of every wallet in the snapshot added up (ADR 0022), raw units times basis points: what a
     * payout's own Weighted Holding is a share of. Null for a round from before the Holding Weight.
     */
    weightedTotal: numeric("weighted_total", { precision: 40, scale: 0 }),
    paid: numeric("paid", { precision: 40, scale: 0 }).notNull().default("0"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("reward_rounds_mint_started_idx").on(t.mint, t.startedAt), index("reward_rounds_source_status_idx").on(t.source, t.status)],
).enableRLS();

/**
 * One holder's payout in one round. Written with the round, so the snapshot is complete before anything is paid; marked
 * `sending` with its transaction before that goes out, so a run that dies never lets the next one pay the wallet twice.
 */
export const rewardPayouts = pgTable(
  "reward_payouts",
  {
    roundId: text("round_id").notNull(),
    wallet: text("wallet").notNull(),
    /** What the wallet held at the snapshot, raw units. */
    holding: numeric("holding", { precision: 40, scale: 0 }).notNull(),
    /**
     * The wallet's Weighted Holding at the snapshot (ADR 0022): each coin counted at its Holding Weight, raw units
     * times basis points. A payout from before the Holding Weight has its holding counted once.
     */
    weightedHolding: numeric("weighted_holding", { precision: 40, scale: 0 }).notNull(),
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    /**
     * `returned`: a SOL payout under the rent-exempt minimum to a wallet holding no SOL, which no transaction can land;
     * its amount stays in the pot for the next round and the round finishes without it.
     */
    status: text("status", { enum: ["unpaid", "sending", "paid", "returned"] }).notNull().default("unpaid"),
    signature: text("signature"),
    /** Past this block height the transaction handed out for this payout can never land. */
    sendableUntil: bigint("sendable_until", { mode: "number" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.wallet] }), index("reward_payouts_wallet_idx").on(t.wallet)],
).enableRLS();

/**
 * Holding Lots (ADR 0022): an amount of a coin a wallet was first seen holding at one Holding Check, with that check's
 * time, which is where the coins' age runs from. Only a Holding Check writes here: it opens a lot for what a wallet
 * holds beyond its lots, and reduces the newest lots first, removing the empty ones, when it holds less. Lots are never
 * merged, so a later rules version can add a longer step and find the ages it needs.
 */
export const holdingLots = pgTable(
  "holding_lots",
  {
    mint: text("mint").notNull(),
    wallet: text("wallet").notNull(),
    /** The time of the Holding Check that opened the lot. */
    since: timestamp("since", { withTimezone: true }).notNull(),
    /** Raw units of the coin, above zero: a lot with nothing left is removed. */
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.wallet, t.since] })],
).enableRLS();

/**
 * Holding Checks (ADR 0022): one row per coin per Holding Day on which the Reward Engine read the coin's accounts and
 * brought its Holding Lots in step with them, written in the same transaction as the lots it changed, so a day is
 * checked once or not at all.
 */
export const holdingChecks = pgTable(
  "holding_checks",
  {
    mint: text("mint").notNull(),
    /** The Holding Day, counted from the epoch: `floor(unix seconds / HOLDING_DAY_SECONDS)`. */
    day: integer("day").notNull(),
    /** The slot the accounts were read at. */
    slot: bigint("slot", { mode: "number" }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    /** How many wallets held the coin, whatever they held. */
    wallets: integer("wallets").notNull(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.day] })],
).enableRLS();

/**
 * Reward Sales (ADR 0006, #43): one row per sale of a Quote Asset payout Reward Launch's collected tax into the coin's
 * own market, written with its signature before the transaction is sent and settled by it, so a run that dies never
 * sells the same coins twice or loses what a sale brought in. A round takes every landed sale not yet in one when it
 * opens; the pot is what the landed sales brought in less what earlier rounds paid.
 */
export const rewardSales = pgTable(
  "reward_sales",
  {
    signature: text("signature").primaryKey(),
    mint: text("mint").notNull(),
    /** Where the slice was sold: the coin's curve, or its CPMM pool after Graduation. */
    venue: text("venue", { enum: ["curve", "pool"] }).notNull(),
    status: text("status", { enum: ["sending", "landed", "failed", "expired"] }).notNull().default("sending"),
    /** Coins sold, raw units, as the transaction was built. */
    coins: numeric("coins", { precision: 40, scale: 0 }).notNull(),
    quoteMint: text("quote_mint").notNull(),
    quoteDecimals: integer("quote_decimals").notNull(),
    /** Quote Asset that reached the operations wallet, raw units; null until the sale has landed. */
    proceeds: numeric("proceeds", { precision: 40, scale: 0 }),
    /** The round whose pot this sale went into; null until a round opens. */
    roundId: text("round_id"),
    /** Past this block height an unconfirmed transaction can never land. */
    lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }).notNull(),
    slot: bigint("slot", { mode: "number" }),
    blockTime: timestamp("block_time", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("reward_sales_mint_idx").on(t.mint, t.status), index("reward_sales_round_idx").on(t.roundId)],
).enableRLS();

/**
 * Creator Buybacks (ADR 0011, #113, #184): one row per run of a coin's `burn` or `liquidity` rule, the buyback its
 * Creator's earnings pay for, written with its transaction's signature before the transaction is sent and settled by
 * it. What a rule has spent of its coin's share counts every row that landed (what it spent) or may still land (the
 * most it may spend), so a run that dies, or a retry, never spends the same share twice; a `failed` or `expired` row
 * moved nothing and frees its amount.
 */
export const creatorBuybacks = pgTable(
  "creator_buybacks",
  {
    signature: text("signature").primaryKey(),
    mint: text("mint").notNull(),
    kind: text("kind", { enum: ["burn", "liquidity"] }).notNull(),
    /** Where the coin was bought: its curve, or its CPMM pool after Graduation. Liquidity is only ever added to the pool. */
    venue: text("venue", { enum: ["curve", "pool"] }).notNull(),
    /** The curve's or the pool's address. */
    market: text("market").notNull(),
    status: text("status", { enum: ["sending", "landed", "failed", "expired"] }).notNull().default("sending"),
    quoteMint: text("quote_mint").notNull(),
    quoteDecimals: integer("quote_decimals").notNull(),
    coinDecimals: integer("coin_decimals").notNull(),
    /** The most Quote Asset the transaction may spend, raw units: counted against the coin's share while it may still land. */
    budget: numeric("budget", { precision: 40, scale: 0 }).notNull(),
    /** The Quote Asset it spent, raw units: the buy, and for liquidity the Quote Asset paired with the coins. Null until it has landed. */
    spent: numeric("spent", { precision: 40, scale: 0 }),
    /** Coins it bought, raw units. Null until it has landed. */
    coins: numeric("coins", { precision: 40, scale: 0 }),
    /** Coins it destroyed, raw units: all it bought under the burn rule. Null until it has landed, and for liquidity. */
    burned: numeric("burned", { precision: 40, scale: 0 }),
    /** Liquidity: the coins and the Quote Asset that went into the pool, raw units. Null until it has landed, and for a burn. */
    coinsAdded: numeric("coins_added", { precision: 40, scale: 0 }),
    quoteAdded: numeric("quote_added", { precision: 40, scale: 0 }),
    /** Liquidity: the LP tokens the deposit minted and the lock took, as the transaction was built. Null for a burn. */
    lpAmount: numeric("lp_amount", { precision: 40, scale: 0 }),
    /** Liquidity: the Fee Key of the locked position this run opened (its NFT mint), and the position. Null for a burn. */
    feeKey: text("fee_key"),
    lockedLiquidity: text("locked_liquidity"),
    /** Past this block height an unconfirmed transaction can never land. */
    lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }).notNull(),
    slot: bigint("slot", { mode: "number" }),
    blockTime: timestamp("block_time", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("creator_buybacks_mint_idx").on(t.mint, t.status)],
).enableRLS();

/** An integrator's API key (#21): only its hash is kept; the key itself is shown once, when issued. */
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  name: text("name").notNull(),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}).enableRLS();

/** Requests per key per minute, which the rate limit is checked against and the key's own usage view shows. */
export const apiKeyUsage = pgTable(
  "api_key_usage",
  {
    keyId: text("key_id").notNull(),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.keyId, t.minute] })],
).enableRLS();

/**
 * A Platform Fee or Creator Fee change the operator announced (#22): public from the moment it is announced, preparable
 * for the admin to sign once its effective time has passed, and marked applied by the Indexer when the change lands.
 */
export const feeAnnouncements = pgTable(
  "fee_announcements",
  {
    id: text("id").primaryKey(),
    platformFeeBps: integer("platform_fee_bps").notNull(),
    creatorFeeBps: integer("creator_fee_bps").notNull(),
    note: text("note"),
    announcedAt: timestamp("announced_at", { withTimezone: true }).notNull().defaultNow(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    appliedSignature: text("applied_signature"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [index("fee_announcements_effective_idx").on(t.effectiveAt)],
).enableRLS();

/** Settings the operator sets at run time, such as the Platform Token once it has launched. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * The Fee Keys the operations wallet holds: the NFT of each locked liquidity position in a graduated coin's pool, with
 * which the Fee Collector collects the position's LP fees. A pool has the position Raydium's migration locked, and one
 * more for every liquidity addition a Creator's earnings paid for (ADR 0011, #184), so a pool can have many.
 */
export const feeKeys = pgTable(
  "fee_keys",
  {
    nftMint: text("nft_mint").primaryKey(),
    nftAccount: text("nft_account").notNull(),
    lockedLiquidity: text("locked_liquidity").notNull(),
    pool: text("pool").notNull(),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * When the Fee Collector last looked at what this position has earned; null before the first look. A run looks at
     * the positions it has not looked at for longest, a bounded number of them, so its work stays within a Cron
     * Trigger's time however many positions there are.
     */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [index("fee_keys_pool_idx").on(t.pool), index("fee_keys_checked_at_idx").on(t.checkedAt)],
).enableRLS();


/**
 * Permanent metadata (#44): one row per data item of a Launch, its image and its metadata JSON, each an ANS-104 item
 * signed with the operations key when the launch was prepared, so the launch transaction carries its Arweave id, and
 * uploaded to ArDrive Turbo by the Metadata Upload job once the Indexer has seen the launch land. The signed bytes
 * wait in R2 under `storage_key`; an abandoned launch is never uploaded and costs nothing.
 */
export const metadataUploads = pgTable(
  "metadata_uploads",
  {
    mint: text("mint").notNull(),
    item: text("item", { enum: ["image", "metadata"] }).notNull(),
    /** The item's Arweave id: the SHA-256 of its signature, base64url, fixed at signing. */
    arweaveId: text("arweave_id").notNull(),
    storageKey: text("storage_key").notNull(),
    /** The whole item, header and data. */
    bytes: integer("bytes").notNull(),
    status: text("status", { enum: ["signed", "uploaded"] }).notNull().default("signed"),
    /** What Turbo charged, in winc; "0" when the item was free or already held. */
    winc: numeric("winc", { precision: 40, scale: 0 }),
    /** That charge in lamports at the SOL price Turbo quoted when it was uploaded. */
    lamports: numeric("lamports", { precision: 40, scale: 0 }),
    /** Turbo's signed receipt. */
    receipt: jsonb("receipt"),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.mint, t.item] }), index("metadata_uploads_status_idx").on(t.status)],
).enableRLS();

/**
 * SOL the operations wallet sent to Turbo for upload credits, one row per transfer, written before the transfer is sent
 * and credited once Turbo has seen it finalized. A transfer that is `sent` is resumed by the next run, never repeated.
 */
export const arweaveTopUps = pgTable("arweave_top_ups", {
  signature: text("signature").primaryKey(),
  lamports: numeric("lamports", { precision: 40, scale: 0 }).notNull(),
  status: text("status", { enum: ["sent", "credited", "failed"] }).notNull().default("sent"),
  /** The credits the transfer bought, once credited. */
  winc: numeric("winc", { precision: 40, scale: 0 }),
  lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}).enableRLS();

/**
 * Posts on X that name a coin (#160): its mint address, its ticker as a cashtag or its page's link, found by the mentions
 * job while the coin trades and drawn as marks on its chart. Each post is stored once per coin, with the market cap the
 * coin stood at when it was posted (the latest trade's price at or before then, times the supply).
 */
export const coinMentions = pgTable(
  "coin_mentions",
  {
    mint: text("mint").notNull(),
    tweetId: text("tweet_id").notNull(),
    url: text("url").notNull(),
    text: text("text").notNull(),
    authorId: text("author_id").notNull(),
    authorHandle: text("author_handle").notNull(),
    authorName: text("author_name"),
    /** Whether the author's picture is cached in the bucket (`x-avatars/<author id>`), which the API serves. */
    authorAvatar: boolean("author_avatar").notNull().default(false),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    /** Whole Quote Asset units; null when the coin had not traded by then and no later trade gives its opening price. */
    marketCap: doublePrecision("market_cap"),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.tweetId] }), index("coin_mentions_mint_posted_idx").on(t.mint, t.postedAt)],
).enableRLS();

/** Where the mentions job's search for each coin last reached: the next search asks only for posts since then. */
export const mentionPolls = pgTable("mention_polls", {
  mint: text("mint").primaryKey(),
  polledAt: timestamp("polled_at", { withTimezone: true }).notNull(),
}).enableRLS();

/**
 * Wallets the operator has named after their owner's X account (#160, the way other terminals list known traders): a
 * trade mark by one of them shows the handle and the picture. Until sign-in links a wallet to X (#159), this list is the
 * only source of such names.
 */
export const notableWallets = pgTable("notable_wallets", {
  wallet: text("wallet").primaryKey(),
  handle: text("handle").notNull(),
  name: text("name"),
  /** Whether a picture is cached in the bucket (`notable-avatars/<wallet>`), which the API serves. */
  avatar: boolean("avatar").notNull().default(false),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
