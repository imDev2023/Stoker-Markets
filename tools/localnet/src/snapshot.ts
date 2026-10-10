// `pnpm --filter @launchpad/localnet snapshot`: takes a snapshot of mainnet's Quote Assets into `fixtures/mainnet`, so
// the development chain quotes what mainnet quotes (see `fixtures/README.md`): every LaunchLab GlobalConfig's quote
// mint (the mint account, and its Metaplex metadata account where it has one), each GlobalConfig's referral allowance,
// and what Jupiter said about each mint on the day (its price, logo, verified flag, liquidity and tags), which the
// Jupiter stand-in in tools/stack serves to the API in Jupiter's own shapes.
// Needs RPC_URL (a mainnet endpoint) and takes JUPITER_API_KEY (the keyed host; the free one without).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import { listGlobalConfigs, metadataPda, programsFor } from "@launchpad/chain";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "mainnet");

/** An account as `solana account --output json` dumps it, which the local chain loads; `rentEpoch` 0 means rent-exempt. */
export type SnapshotAccount = { lamports: number; data: [string, "base64"]; owner: string; executable: boolean; rentEpoch: number; space: number };

export type SnapshotQuote = {
  mint: string;
  /** The GlobalConfig's `max_share_fee_rate` (1e6 denominator): the most a referred trade may pay its referrer. */
  maxShareFeeRate: string;
  mintAccount: SnapshotAccount;
  /** The Metaplex metadata account, for a mint named through it; null for a Token-2022 mint named in its own extension, or an unnamed one. */
  metadataAccount: SnapshotAccount | null;
};

export type QuotesSnapshot = { takenAt: string; slot: number; quotes: SnapshotQuote[] };

/** Jupiter's Price API v3 entry for a mint, as it answers: `usdPrice`, and for a ScaledUiAmount mint the price per unscaled unit. */
export type SnapshotPrice = { usdPrice: number; scaledUiConfig?: { usdPricePrescaled?: number } };

/** Jupiter's Tokens API v2 entry for a mint, the fields the API reads and the ones that help a reader of the file. */
export type SnapshotToken = {
  name: string | null; symbol: string | null; icon: string | null; isVerified: boolean; liquidity: number | null; tags: string[]; launchpad: string | null;
};

export type MarketSnapshot = { takenAt: string; prices: Record<string, SnapshotPrice>; tokens: Record<string, SnapshotToken> };

const ACCOUNTS_PER_CALL = 100;
const JUPITER_PRICE_IDS_MAX = 50;
const JUPITER_TOKEN_IDS_MAX = 50;

const toSnapshotAccount = (a: AccountInfo<Buffer>): SnapshotAccount => ({
  lamports: a.lamports, data: [a.data.toString("base64"), "base64"], owner: a.owner.toBase58(), executable: a.executable, rentEpoch: 0, space: a.data.length,
});

async function readAccounts(connection: Connection, keys: PublicKey[]) {
  const out: (AccountInfo<Buffer> | null)[] = [];
  let slot = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < keys.length; i += ACCOUNTS_PER_CALL) {
    const { context, value } = await connection.getMultipleAccountsInfoAndContext(keys.slice(i, i + ACCOUNTS_PER_CALL), "confirmed");
    out.push(...value);
    slot = Math.min(slot, context.slot);
  }
  return { slot, accounts: out };
}

const RATE_LIMIT_WAIT_MS = 2_500;
const RATE_LIMIT_TRIES = 5;

/**
 * Jupiter, in batches: a rate-limited batch waits and goes again, and a batch the host refuses otherwise is retried in
 * halves, so one mint it chokes on costs one mint, not fifty.
 */
async function jupiter<T>(host: string, apiKey: string | undefined, path: (ids: string[]) => string, ids: string[], max: number, read: (body: unknown) => T[]): Promise<T[]> {
  const out: T[] = [];
  const fetchBatch = async (batch: string[]): Promise<void> => {
    let res: Response | undefined;
    for (let attempt = 0; attempt < RATE_LIMIT_TRIES; attempt++) {
      res = await fetch(`${host}${path(batch)}`, { headers: apiKey ? { "x-api-key": apiKey } : {} });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
    }
    if (res!.ok) return void out.push(...read(await res!.json()));
    if (batch.length === 1) return void console.warn(`Jupiter ${res!.status} for ${batch[0]}; left out`);
    await fetchBatch(batch.slice(0, Math.ceil(batch.length / 2)));
    await fetchBatch(batch.slice(Math.ceil(batch.length / 2)));
  };
  for (let i = 0; i < ids.length; i += max) await fetchBatch(ids.slice(i, i + max));
  return out;
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL (a mainnet endpoint) is required");
  const apiKey = process.env.JUPITER_API_KEY || undefined;
  const host = apiKey ? "https://api.jup.ag" : "https://lite-api.jup.ag";
  const connection = new Connection(rpcUrl, "confirmed");
  const takenAt = new Date().toISOString();

  const configs = await listGlobalConfigs(connection, programsFor("mainnet").launchlab);
  console.log(`${configs.length} GlobalConfigs`);
  const mints = configs.map((c) => c.quoteMint);
  const { slot, accounts: mintAccounts } = await readAccounts(connection, mints);
  const { accounts: metadataAccounts } = await readAccounts(connection, mints.map(metadataPda));

  const quotes: SnapshotQuote[] = [];
  configs.forEach((c, i) => {
    const mint = mintAccounts[i];
    if (!mint) return console.warn(`${c.quoteMint.toBase58()} has a GlobalConfig but no mint account; left out`);
    const metadata = metadataAccounts[i];
    quotes.push({
      mint: c.quoteMint.toBase58(),
      maxShareFeeRate: c.maxShareFeeRate.toString(),
      mintAccount: toSnapshotAccount(mint),
      metadataAccount: metadata ? toSnapshotAccount(metadata) : null,
    });
  });
  quotes.sort((a, b) => a.mint.localeCompare(b.mint));

  const ids = quotes.map((q) => q.mint);
  type PriceBody = Record<string, { usdPrice?: number; scaledUiConfig?: { usdPricePrescaled?: number } } | null>;
  const prices: Record<string, SnapshotPrice> = {};
  for (const [mint, p] of await jupiter(host, apiKey, (b) => `/price/v3?ids=${b.join(",")}`, ids, JUPITER_PRICE_IDS_MAX, (body) => Object.entries((body ?? {}) as PriceBody))) {
    if (typeof p?.usdPrice !== "number") continue;
    prices[mint] = p.scaledUiConfig?.usdPricePrescaled !== undefined ? { usdPrice: p.usdPrice, scaledUiConfig: { usdPricePrescaled: p.scaledUiConfig.usdPricePrescaled } } : { usdPrice: p.usdPrice };
  }
  type TokenBody = { id: string; name?: string; symbol?: string; icon?: string; isVerified?: boolean; liquidity?: number | null; tags?: string[] | null; launchpad?: string | null };
  const tokens: Record<string, SnapshotToken> = {};
  for (const t of await jupiter(host, apiKey, (b) => `/tokens/v2/search?query=${b.join(",")}`, ids, JUPITER_TOKEN_IDS_MAX, (body) => ((body ?? []) as TokenBody[]))) {
    if (!ids.includes(t.id)) continue;
    tokens[t.id] = {
      name: t.name ?? null,
      symbol: t.symbol ?? null,
      icon: t.icon && /^https:\/\//.test(t.icon) ? t.icon : null,
      isVerified: t.isVerified === true,
      liquidity: typeof t.liquidity === "number" && Number.isFinite(t.liquidity) ? t.liquidity : null,
      tags: Array.isArray(t.tags) ? t.tags.filter((x): x is string => typeof x === "string") : [],
      launchpad: t.launchpad ?? null,
    };
  }

  mkdirSync(OUT, { recursive: true });
  const quotesFile: QuotesSnapshot = { takenAt, slot, quotes };
  const marketFile: MarketSnapshot = { takenAt, prices, tokens };
  writeFileSync(join(OUT, "quotes.json"), JSON.stringify(quotesFile));
  writeFileSync(join(OUT, "market.json"), JSON.stringify(marketFile, null, 1));
  console.log(
    `${quotes.length} quote mints (${quotes.filter((q) => q.metadataAccount).length} with Metaplex metadata), ` +
      `${Object.keys(prices).length} priced, ${Object.keys(tokens).length} on Jupiter's list; written to ${OUT}`,
  );
}

await main();
