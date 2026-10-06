// Launch modes behind one launch interface: a standard coin, the Creator's first buy inside the launch transaction, and
// an airdrop paid from that first buy afterwards. Drafts make every retry rebuild the same coin.
import { HTTPException } from "hono/http-exception";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { ACCOUNT_SIZE, ExtensionType, getAccountLen, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { eq, asc } from "drizzle-orm";
import {
  curvePrice, firstBuyTakesCurve, LAUNCH_SHAPE, loadLookupTable, RATE_DENOMINATOR, planAirdrop, prepareLaunch, quoteFirstBuy, readTransferFees,
  rewardTaxFee, WSOL_MINT, type FirstBuyQuote, type LaunchPairing,
} from "@launchpad/chain";
import type { AirdropRecipients, GraduationTarget, LaunchModesSummary, PreparedLaunch, RewardPayoutAsset, RewardTaxBps, TradeQuote } from "@launchpad/contract";
import { airdropRecipients, launchDrafts, launchMetadata, type Db } from "@launchpad/db";
import type { Config } from "./env";
import { arweaveUrl, signedItems } from "./metadata";
import { draftMintKeypair } from "./mintKeys";
import { launchQuoteAsBuilt, priceLaunch, type LaunchQuote } from "./quotes/assets";
import type { QuoteMarket } from "./quotes/pricing";

/** A launch's Quote Asset: its pairing on-chain, its decimals and ticker, and the Graduation Target in both terms. */
export type QuoteAsset = LaunchPairing & { decimals: number; ticker: string; graduationTarget: GraduationTarget };

const fromLaunchQuote = (q: LaunchQuote): QuoteAsset => ({
  globalConfig: q.globalConfig,
  quoteMint: q.mint,
  quoteTokenProgram: q.tokenProgram,
  graduationTargetRaw: new BN(q.graduationTarget.raw),
  graduationTarget: q.graduationTarget,
  decimals: q.decimals,
  ticker: q.ticker,
});

/**
 * The Quote Asset a new launch pairs with, as the Creator chose it, with its Graduation Target fixed from the live price.
 * The one place the launch modes learn the Quote Asset; Asset Pairing decides it.
 */
export async function launchQuoteAsset(db: Db, cfg: Config, market: QuoteMarket, quoteMint: string): Promise<QuoteAsset> {
  return fromLaunchQuote(await priceLaunch(db, cfg, market, quoteMint));
}

/**
 * The Quote Asset a draft was prepared with, at the Graduation Target it was prepared at, so a retry rebuilds exactly the
 * launch the Creator reviewed. Refused once our curve rule has moved past that target (the price drifted since).
 */
async function draftQuoteAsset(db: Db, cfg: Config, d: typeof launchDrafts.$inferSelect): Promise<QuoteAsset> {
  const built = await launchQuoteAsBuilt(db, cfg, d.quoteMint, { raw: d.graduationTarget, lamports: d.graduationTargetLamports });
  if ("blocked" in built)
    throw new LaunchModeError(`${built.blocked} This launch was prepared at an earlier price, so it can't launch as it was. Start a new launch.`);
  return fromLaunchQuote(built);
}

/** A fresh nonce for a new draft; with the secret it derives the draft's mint key. */
export const newMintKeyNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

/** A first buy quote in the contract's terms: amounts as decimal strings, prices in whole units. */
export function firstBuyToContract(q: FirstBuyQuote, quoteDecimals: number, quoteTransferFeeBps = 0, rewardTaxBps = 0): TradeQuote {
  const t = q.quote;
  const bps = (rate: BN) => (Number(rate.toString()) * 10_000) / RATE_DENOMINATOR;
  return {
    venue: "curve",
    side: "buy",
    amountIn: t.amountIn.toString(),
    amountOut: t.amountOut.toString(),
    // The first buy lands with the launch as the curve's first trade, so it fills exactly as quoted.
    minAmountOut: t.amountOut.toString(),
    slippageBps: 0,
    fees: { raydium: t.fees.protocol.toString(), platform: t.fees.platform.toString(), creator: t.fees.creator.toString() },
    feeBps: { raydium: bps(q.rates.protocol), platform: bps(q.rates.platform), creator: bps(q.rates.creator) },
    transferFees: { quote: t.transferFees.quote.toString(), base: t.transferFees.base.toString() },
    transferFeeBps: { quote: quoteTransferFeeBps, base: rewardTaxBps },
    priceBefore: curvePrice(q.start, LAUNCH_SHAPE.decimals, quoteDecimals),
    priceAfter: curvePrice(t.after, LAUNCH_SHAPE.decimals, quoteDecimals),
    completesCurve: firstBuyTakesCurve(t),
    // A first buy is paid in the Quote Asset: a SOL swap would not fit the launch transaction beside it.
    route: null,
    // Nobody refers a Creator's own first buy.
    referral: null,
  };
}

/**
 * A first buy quote with the transfer fees it allows for: the Quote Asset's, if it carries one, paid on the way in, and
 * the coin's Reward Tax on a Reward Launch, withheld from the coins on the way out.
 */
export type LaunchFirstBuy = FirstBuyQuote & { quoteTransferFeeBps: number; rewardTaxBps: number };

/** Quotes a first buy, refusing one that would sell out the curve inside its own launch. */
export async function quoteLaunchFirstBuy(
  connection: Connection, cfg: Config, quote: QuoteAsset, amount: BN, rewardTaxBps: RewardTaxBps | null = null,
): Promise<LaunchFirstBuy> {
  const transferFee = (await readTransferFees(connection, [quote.quoteMint])).get(quote.quoteMint.toBase58()) ?? null;
  const q = await quoteFirstBuy(connection, { ...quote, platformConfig: cfg.platformConfig }, amount, { quote: transferFee, base: rewardTaxFee(rewardTaxBps) });
  if (q.quote.amountOut.isZero()) throw new LaunchModeError("The first buy is too small to get any coins. Enter a larger amount.");
  if (firstBuyTakesCurve(q.quote))
    throw new LaunchModeError("A first buy can't take every coin on the curve. Enter a smaller amount.");
  return { ...q, quoteTransferFeeBps: transferFee?.bps ?? 0, rewardTaxBps: rewardTaxBps ?? 0 };
}

/** A launch-mode request that can't be built, with the reason in words a Creator can act on. */
export class LaunchModeError extends Error {}

const LAMPORTS_PER_SIGNATURE = 5_000;

/**
 * A First Buy in a token other than SOL is paid from the Creator's own account of it, so say plainly when that holds too
 * little: the wallet's simulation would only report a failed token transfer. For SOL that simulation already says it,
 * counting fees and rent too.
 */
async function checkQuoteBalance(connection: Connection, quote: QuoteAsset, creator: PublicKey, needed: BN) {
  if (quote.quoteMint.equals(WSOL_MINT)) return;
  const account = getAssociatedTokenAddressSync(quote.quoteMint, creator, false, quote.quoteTokenProgram);
  const held = new BN((await connection.getTokenAccountBalance(account, "confirmed").catch(() => null))?.value.amount ?? "0");
  if (held.lt(needed))
    throw new LaunchModeError(`Your wallet doesn't hold enough ${quote.ticker} for this first buy. Add ${quote.ticker} or buy less.`);
}

/**
 * Checks the launch modes together and describes them: an airdrop needs a first buy, may not include the Creator, may
 * only pay wallets (not program accounts) and may give away no more coins than the first buy gets.
 */
export async function resolveLaunchModes(
  connection: Connection, cfg: Config, quote: QuoteAsset, creator: PublicKey, firstBuy: BN | null, airdrop: AirdropRecipients,
  rewardTaxBps: RewardTaxBps | null = null, rewardPayout: RewardPayoutAsset | null = null,
): Promise<{ firstBuy: LaunchFirstBuy | null; summary: LaunchModesSummary }> {
  if (rewardPayout && !rewardTaxBps) throw new LaunchModeError("A payout asset is only for a Reward Launch. Choose a Reward Tax, or leave the payout asset out.");
  const rewardTax = rewardTaxBps ? { bps: rewardTaxBps, payout: rewardPayout ?? ("coin" as const) } : null;
  const bought = firstBuy ? await quoteLaunchFirstBuy(connection, cfg, quote, firstBuy, rewardTaxBps) : null;
  const toContract = (b: LaunchFirstBuy) => firstBuyToContract(b, quote.decimals, b.quoteTransferFeeBps, b.rewardTaxBps);
  if (bought) await checkQuoteBalance(connection, quote, creator, bought.quote.amountIn);
  if (airdrop.length === 0) return { firstBuy: bought, summary: { rewardTax, firstBuy: bought && toContract(bought), airdrop: null } };
  if (!bought) throw new LaunchModeError("An airdrop is paid from your first buy. Add a first buy.");
  const recipients = airdrop.map((r) => ({ wallet: new PublicKey(r.wallet), amount: new BN(r.amount) }));
  for (const r of recipients) {
    if (r.wallet.equals(creator)) throw new LaunchModeError("Your own wallet can't be in the airdrop: it keeps whatever the airdrop doesn't give away.");
    if (!PublicKey.isOnCurve(r.wallet.toBytes())) throw new LaunchModeError(`${r.wallet.toBase58()} is a program account, not a wallet.`);
  }
  const amount = recipients.reduce((sum, r) => sum.add(r.amount), new BN(0));
  if (amount.gt(bought.quote.amountOut))
    throw new LaunchModeError("The airdrop gives away more coins than your first buy gets. Buy more or airdrop less.");
  // The coin is new, so every wallet needs a new coin account; the Creator pays its rent. A Reward Launch's coin accounts
  // are Token-2022 ones with the transfer-fee extension, so a little larger.
  const tokenProgram = rewardTaxBps ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const transactions = planAirdrop({
    creator, mint: Keypair.generate().publicKey, decimals: LAUNCH_SHAPE.decimals, tokenProgram, recipients,
    lookupTable: await loadLookupTable(connection, cfg.lookupTable),
  }).length;
  const accountSize = rewardTaxBps ? getAccountLen([ExtensionType.TransferFeeAmount]) : ACCOUNT_SIZE;
  const rent = await connection.getMinimumBalanceForRentExemption(accountSize, "confirmed");
  const costLamports = BigInt(rent) * BigInt(recipients.length) + BigInt(LAMPORTS_PER_SIGNATURE * transactions);
  return {
    firstBuy: bought,
    summary: {
      rewardTax,
      firstBuy: toContract(bought),
      airdrop: { recipients: recipients.length, amount: amount.toString(), transactions, costLamports: costLamports.toString() },
    },
  };
}

/** Keeps what the Creator asked for, so a retry rebuilds the same launch. */
export async function saveDraft(
  db: Db,
  d: {
    mint: PublicKey; creator: PublicKey; nonce: string | null; quote: QuoteAsset; firstBuy: BN | null; airdrop: AirdropRecipients; rewardTaxBps: RewardTaxBps | null;
    rewardPayout: RewardPayoutAsset | null;
  },
) {
  await db.transaction(async (tx) => {
    await tx.insert(launchDrafts).values({
      mint: d.mint.toBase58(),
      creator: d.creator.toBase58(),
      mintKeyNonce: d.nonce,
      quoteMint: d.quote.quoteMint.toBase58(),
      globalConfig: d.quote.globalConfig.toBase58(),
      graduationTarget: d.quote.graduationTarget.raw,
      graduationTargetLamports: d.quote.graduationTarget.lamports,
      firstBuy: d.firstBuy?.toString() ?? null,
      rewardTaxBps: d.rewardTaxBps,
      // The Payout Asset is fixed here, with the coin's address: a retry and the Indexer read it back from this row.
      rewardPayout: d.rewardTaxBps ? (d.rewardPayout ?? "coin") : null,
    });
    if (d.airdrop.length > 0)
      await tx.insert(airdropRecipients).values(
        d.airdrop.map((r, position) => ({ mint: d.mint.toBase58(), wallet: r.wallet, position, amount: r.amount })),
      );
  });
}

export async function loadDraft(db: Db, mint: string) {
  const [row] = await db
    .select()
    .from(launchDrafts)
    .innerJoin(launchMetadata, eq(launchMetadata.id, launchDrafts.mint))
    .where(eq(launchDrafts.mint, mint))
    .limit(1);
  if (!row) return null;
  const recipients = await db.select().from(airdropRecipients).where(eq(airdropRecipients.mint, mint)).orderBy(asc(airdropRecipients.position));
  // The permanent metadata was signed when the draft was first prepared, so a retry carries the same Arweave address.
  const items = await signedItems(db, mint);
  if (!items) throw new Error(`draft ${mint} has no signed metadata items`);
  return { draft: row.launch_drafts, metadata: row.launch_metadata, recipients, items };
}

export type LoadedDraft = NonNullable<Awaited<ReturnType<typeof loadDraft>>>;

/** Builds a draft's launch transaction, signed by its mint key, with the Quote Asset and launch modes it was prepared with. */
export async function buildLaunch(
  db: Db, connection: Connection, cfg: Config, loaded: LoadedDraft, quote: QuoteAsset, firstBuy: FirstBuyQuote | null, summary: LaunchModesSummary,
) {
  const { draft, metadata, items } = loaded;
  const metadataUri = arweaveUrl(cfg.arweave, items.metadata.arweaveId);
  const prepared = await prepareLaunch(
    connection,
    {
      globalConfig: quote.globalConfig,
      quoteMint: quote.quoteMint,
      quoteTokenProgram: quote.quoteTokenProgram,
      graduationTargetRaw: quote.graduationTargetRaw,
      program: cfg.launchlab,
      platformConfig: cfg.platformConfig,
      creator: new PublicKey(draft.creator),
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      firstBuy: firstBuy?.quote ?? null,
      lookupTable: await loadLookupTable(connection, cfg.lookupTable),
      rewardTaxBps: draft.rewardTaxBps,
    },
    await draftMintKeypair(db, cfg, draft),
  );
  if (prepared.mint.toBase58() !== draft.mint) throw new Error(`draft ${draft.mint} derived a different mint key`);
  const body: PreparedLaunch = {
    transaction: prepared.transaction,
    mint: draft.mint,
    pool: prepared.pool.toBase58(),
    metadataUri,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
    graduationTarget: quote.graduationTarget,
    ...summary,
  };
  return body;
}

/** Re-checks a stored draft's Quote Asset and launch modes against the chain as it is now, for a retry. */
export async function resolveDraftModes(db: Db, connection: Connection, cfg: Config, loaded: LoadedDraft) {
  const { draft, recipients } = loaded;
  const quote = await draftQuoteAsset(db, cfg, draft);
  const modes = await resolveLaunchModes(
    connection,
    cfg,
    quote,
    new PublicKey(draft.creator),
    draft.firstBuy ? new BN(draft.firstBuy) : null,
    recipients.map((r) => ({ wallet: r.wallet, amount: r.amount })),
    (draft.rewardTaxBps as RewardTaxBps | null) ?? null,
    draft.rewardPayout,
  );
  return { quote, ...modes };
}

/** Turns a launch-mode refusal into an HTTP error with its reason; anything else stays an internal error. */
export function refuseWith(status: 400 | 409) {
  return (e: unknown): never => {
    if (e instanceof LaunchModeError) throw new HTTPException(status, { message: e.message });
    throw e;
  };
}
