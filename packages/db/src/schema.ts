import { bigint, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { QuoteLabel } from "@launchpad/contract";

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
    /** A Reward Launch's Reward Tax in basis points (100, 300 or 500); null for a standard coin. */
    rewardTaxBps: integer("reward_tax_bps"),
    /**
     * The transaction in which the operations wallet gave up the coin's transfer-fee-config authority for good, once
     * Raydium's migration handed it over; from then on nobody can change the Reward Tax. Null until then.
     */
    rewardTaxLockedSignature: text("reward_tax_locked_signature"),
    rewardTaxLockedAt: timestamp("reward_tax_locked_at", { withTimezone: true }),
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
  /** The GlobalConfig's `max_share_fee_rate` (1e6 denominator): the most a referred trade may pay its referrer; 0 on most. */
  maxShareFeeRate: bigint("max_share_fee_rate", { mode: "number" }).notNull().default(0),
  /**
   * Quote Risk Labels (#11), as the API shows them; null until the mint has been checked. `labelsSlot` is the slot the
   * mint was read at, so a read from an older slot never overwrites a newer one.
   */
  labels: jsonb("labels").$type<QuoteLabel[]>(),
  labelsSlot: bigint("labels_slot", { mode: "number" }),
  labelsCheckedAt: timestamp("labels_checked_at", { withTimezone: true }),
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
    /** The Reward Tax the Creator chose, in basis points; null for a standard Launch. */
    rewardTaxBps: integer("reward_tax_bps"),
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
    /** platform_fee, pool_fee, fee_key, sweep, creator_forward, burn or flywheel so far. */
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
);

/**
 * Every transaction a scheduled job signs, written before it is sent: a job that dies between sending and recording finds
 * its transaction here on the next run and records what landed, so nothing it moved is missing from the Ledger.
 */
export const jobTransactions = pgTable("job_transactions", {
  signature: text("signature").primaryKey(),
  job: text("job").notNull(),
  /** What the transaction does, such as a revenue kind. */
  purpose: text("purpose").notNull(),
  /** The account it acts on: a fee vault, a pool, or the treasury. */
  subject: text("subject").notNull(),
  status: text("status", { enum: ["pending", "landed", "failed", "expired"] }).notNull().default("pending"),
  /** Past this block height an unconfirmed transaction can never land. */
  lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/**
 * The Creator Forward (ADR 0007): one row per payment of a Creator's share of platform revenue in one Quote Asset,
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
);

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
);

/** A lease on a job, so two runs of it (a Cron Trigger and a manual one) never overlap. It lapses if its holder dies. */
export const jobLocks = pgTable("job_locks", {
  job: text("job").primaryKey(),
  runId: text("run_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

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
  note: text("note"),
  announcedAt: timestamp("announced_at", { withTimezone: true }).notNull().defaultNow(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
});

/** One Reward Round of one Reward Launch: its snapshot, the pot it pays out, and how far it has got. */
export const rewardRounds = pgTable(
  "reward_rounds",
  {
    id: text("id").primaryKey(),
    mint: text("mint").notNull(),
    rulesVersion: integer("rules_version").notNull(),
    status: text("status", { enum: ["paying", "paid"] }).notNull(),
    snapshotSlot: bigint("snapshot_slot", { mode: "number" }).notNull(),
    /** The collected tax in the operations wallet's account of the coin at the snapshot, raw units. */
    pot: numeric("pot", { precision: 40, scale: 0 }).notNull(),
    eligibleHolders: integer("eligible_holders").notNull(),
    /** What the payouts add up to; rounding leaves the pot's last units for the next round. */
    distributable: numeric("distributable", { precision: 40, scale: 0 }).notNull(),
    paid: numeric("paid", { precision: 40, scale: 0 }).notNull().default("0"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("reward_rounds_mint_started_idx").on(t.mint, t.startedAt)],
);

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
    amount: numeric("amount", { precision: 40, scale: 0 }).notNull(),
    status: text("status", { enum: ["unpaid", "sending", "paid"] }).notNull().default("unpaid"),
    signature: text("signature"),
    /** Past this block height the transaction handed out for this payout can never land. */
    sendableUntil: bigint("sendable_until", { mode: "number" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.wallet] }), index("reward_payouts_wallet_idx").on(t.wallet)],
);

/** An integrator's API key (#21): only its hash is kept; the key itself is shown once, when issued. */
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  name: text("name").notNull(),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** Requests per key per minute, which the rate limit is checked against and the key's own usage view shows. */
export const apiKeyUsage = pgTable(
  "api_key_usage",
  {
    keyId: text("key_id").notNull(),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.keyId, t.minute] })],
);

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
);

/** Settings the operator sets at run time, such as the Platform Token once it has launched. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fee Key NFTs the operations wallet holds, each found on-chain once: which pool's locked LP it collects for. */
export const feeKeys = pgTable("fee_keys", {
  nftMint: text("nft_mint").primaryKey(),
  nftAccount: text("nft_account").notNull(),
  lockedLiquidity: text("locked_liquidity").notNull(),
  pool: text("pool").notNull().unique(),
  foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
});

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
);

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
});
