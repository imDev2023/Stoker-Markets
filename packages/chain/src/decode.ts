import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import BN from "bn.js";
import { launchlabCoder } from "./coder";

/**
 * The transaction shape Helius delivers in "raw" webhooks, which is the RPC `getTransaction` JSON encoding.
 * Only the fields the decoder reads are typed.
 */
export type RawTransaction = {
  slot: number;
  blockTime: number | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: string[];
      instructions: { programIdIndex: number; accounts: number[]; data: string }[];
    };
  };
  meta: {
    err: unknown;
    loadedAddresses?: { writable: string[]; readonly: string[] };
    innerInstructions?: { index: number; instructions: { programIdIndex: number; accounts: number[]; data: string }[] }[];
  } | null;
};

export type LaunchCreated = {
  kind: "launch_created";
  signature: string;
  slot: number;
  blockTime: number | null;
  pool: PublicKey;
  creator: PublicKey;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  supply: BN;
  totalBaseSell: BN;
  graduationTargetRaw: BN;
};

export type ChainEvent = LaunchCreated;

const INITIALIZE_IXS = new Set(["initialize", "initialize_v2", "initialize_with_token_2022"]);
// Account positions shared by all three initialize instructions.
const IX_ACCOUNT = { creator: 1, globalConfig: 2, platformConfig: 3, pool: 5, baseMint: 6, quoteMint: 7 } as const;

/** Turns one confirmed transaction into the LaunchLab events we index. Failed transactions yield nothing. */
export function decodeTransaction(raw: RawTransaction, launchlab: PublicKey): ChainEvent[] {
  if (!raw.meta || raw.meta.err) return [];
  const keys = [
    ...raw.transaction.message.accountKeys,
    ...(raw.meta.loadedAddresses?.writable ?? []),
    ...(raw.meta.loadedAddresses?.readonly ?? []),
  ];
  const program = launchlab.toBase58();
  const signature = raw.transaction.signatures[0]!;
  const all = [
    ...raw.transaction.message.instructions,
    ...(raw.meta.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];
  const events: ChainEvent[] = [];
  for (const ix of all) {
    if (keys[ix.programIdIndex] !== program) continue;
    const decoded = safeDecodeIx(ix.data);
    if (!decoded || !INITIALIZE_IXS.has(decoded.name)) continue;
    const acct = (i: number) => new PublicKey(keys[ix.accounts[i]!]!);
    const data = decoded.data as {
      base_mint_param: { decimals: number; name: string; symbol: string; uri: string };
      curve_param: { Constant?: { data: { supply: BN; total_base_sell: BN; total_quote_fund_raising: BN } } };
    };
    const curve = data.curve_param.Constant?.data;
    if (!curve) continue; // our platform only allows the constant-product curve
    events.push({
      kind: "launch_created",
      signature,
      slot: raw.slot,
      blockTime: raw.blockTime,
      pool: acct(IX_ACCOUNT.pool),
      creator: acct(IX_ACCOUNT.creator),
      globalConfig: acct(IX_ACCOUNT.globalConfig),
      platformConfig: acct(IX_ACCOUNT.platformConfig),
      baseMint: acct(IX_ACCOUNT.baseMint),
      quoteMint: acct(IX_ACCOUNT.quoteMint),
      name: data.base_mint_param.name,
      symbol: data.base_mint_param.symbol,
      uri: data.base_mint_param.uri,
      decimals: data.base_mint_param.decimals,
      supply: curve.supply,
      totalBaseSell: curve.total_base_sell,
      graduationTargetRaw: curve.total_quote_fund_raising,
    });
  }
  return events;
}

function safeDecodeIx(data: string) {
  try {
    return launchlabCoder.instruction.decode(Buffer.from(bs58.decode(data)));
  } catch {
    return null;
  }
}
