import { PublicKey, type Connection } from "@solana/web3.js";
import {
  AccountState, ExtensionType, getDefaultAccountState, getExtensionData, getInterestBearingMintConfigState, getPausableConfig, getPermanentDelegate,
  getScaledUiAmountConfig, getTransferFeeConfig, getTransferHook, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint,
} from "@solana/spl-token";
import { unpack as unpackTokenMetadata } from "@solana/spl-token-metadata";
import type BN from "bn.js";
import { launchlabCoder } from "./coder";
import { launchlabPdas, metadataPda } from "./pda";
import type { RuleConstraint } from "./shape";

/** A LaunchLab GlobalConfig: Raydium's per-quote-mint config that makes a token usable as a Quote Asset. */
export type GlobalConfigInfo = {
  address: PublicKey;
  quoteMint: PublicKey;
  index: number;
  /** The most a referred trade may pay its referrer, in the 1e6 denominator; 0 on most configs (1% on SOL's). */
  maxShareFeeRate: BN;
};

/**
 * Every constant-product GlobalConfig of the program, one per quote mint (the lowest index where Raydium made several,
 * as devnet has for SOL). Our launch shape is constant-product, so other curve types are not Quote Assets for us.
 */
export async function listGlobalConfigs(connection: Connection, program: PublicKey): Promise<GlobalConfigInfo[]> {
  const accounts = await connection.getProgramAccounts(program, { filters: [{ memcmp: launchlabCoder.accounts.memcmp("GlobalConfig") }] });
  const byMint = new Map<string, GlobalConfigInfo>();
  for (const { pubkey, account } of accounts) {
    const c = launchlabCoder.accounts.decode("GlobalConfig", account.data) as { curve_type: number; index: number; quote_mint: PublicKey; max_share_fee_rate: BN };
    if (c.curve_type !== 0) continue;
    const seen = byMint.get(c.quote_mint.toBase58());
    if (!seen || c.index < seen.index)
      byMint.set(c.quote_mint.toBase58(), { address: pubkey, quoteMint: c.quote_mint, index: c.index, maxShareFeeRate: c.max_share_fee_rate });
  }
  return [...byMint.values()];
}

export type QuoteMintInfo = {
  mint: PublicKey;
  tokenProgram: PublicKey;
  decimals: number;
  /** From the Token-2022 metadata extension or the Metaplex metadata account; null when the mint has neither. */
  name: string | null;
  symbol: string | null;
  /** Who can freeze token accounts of this mint, and who can move tokens out of any of them (Token-2022); issuers of real-world assets hold these. */
  freezeAuthority: PublicKey | null;
  permanentDelegate: PublicKey | null;
  /** Who can mint more; null when minting is closed for good. */
  mintAuthority: PublicKey | null;
  /** The mint's other Token-2022 extensions that bear on its holders (Quote Risk Labels, #11); each null when absent. */
  controls: MintControls;
};

export type MintControls = {
  pausable: { authority: PublicKey; paused: boolean } | null;
  /** `programId` null when the extension is there but no hook program is set (the issuer can set one later). */
  transferHook: { programId: PublicKey | null; authority: PublicKey | null } | null;
  defaultAccountState: "initialized" | "frozen" | null;
  /** The fee in force at the epoch the mint was read, and the one scheduled to replace it, if any. */
  transferFee: { currentBps: number; maximumFee: bigint; scheduled: { bps: number; epoch: number } | null; authority: PublicKey | null } | null;
  scaledUiAmount: { multiplier: number; authority: PublicKey | null } | null;
  interestBearing: { rateBps: number; authority: PublicKey | null } | null;
};

const NO_KEY = PublicKey.default;
const optional = (k: PublicKey | null | undefined) => (k && !k.equals(NO_KEY) ? k : null);

/** The Token-2022 extensions of a mint that its holders should know about; every field null for an SPL Token mint. */
function mintControls(mint: ReturnType<typeof unpackMint>, epoch: number): MintControls {
  if (!mint.tlvData.length) return { pausable: null, transferHook: null, defaultAccountState: null, transferFee: null, scaledUiAmount: null, interestBearing: null };
  const pausable = getPausableConfig(mint);
  const hook = getTransferHook(mint);
  const state = getDefaultAccountState(mint);
  const fee = getTransferFeeConfig(mint);
  const scaled = getScaledUiAmountConfig(mint);
  const interest = getInterestBearingMintConfigState(mint);
  let transferFee: MintControls["transferFee"] = null;
  if (fee) {
    // Token-2022 keeps two fees: the newer applies from its epoch on, the older until then.
    const newerLive = epoch >= Number(fee.newerTransferFee.epoch);
    const current = newerLive ? fee.newerTransferFee : fee.olderTransferFee;
    const scheduled = !newerLive && fee.newerTransferFee.transferFeeBasisPoints !== current.transferFeeBasisPoints
      ? { bps: fee.newerTransferFee.transferFeeBasisPoints, epoch: Number(fee.newerTransferFee.epoch) }
      : null;
    transferFee = { currentBps: current.transferFeeBasisPoints, maximumFee: current.maximumFee, scheduled, authority: optional(fee.transferFeeConfigAuthority) };
  }
  return {
    pausable: pausable ? { authority: pausable.authority, paused: pausable.paused } : null,
    transferHook: hook ? { programId: optional(hook.programId), authority: optional(hook.authority) } : null,
    defaultAccountState: state ? (state.state === AccountState.Frozen ? "frozen" : "initialized") : null,
    transferFee,
    scaledUiAmount: scaled ? { multiplier: scaled.multiplier, authority: optional(scaled.authority) } : null,
    interestBearing: interest ? { rateBps: interest.currentRate, authority: optional(interest.rateAuthority) } : null,
  };
}

const MULTIPLE_ACCOUNTS_MAX = 100;

async function getAccounts(connection: Connection, keys: PublicKey[]) {
  const out = [];
  for (let i = 0; i < keys.length; i += MULTIPLE_ACCOUNTS_MAX)
    out.push(...(await connection.getMultipleAccountsInfo(keys.slice(i, i + MULTIPLE_ACCOUNTS_MAX), "confirmed")));
  return out;
}

/**
 * Reads each quote mint's token program, decimals, on-chain name and symbol, authorities and extensions, with the slot
 * the mints were read at (a later read at a lower slot is older news). Mints that don't exist are left out.
 */
export async function readQuoteMints(connection: Connection, mints: PublicKey[]): Promise<{ slot: number; epoch: number; mints: Map<string, QuoteMintInfo> }> {
  const [read, metadataAccounts, epochInfo] = await Promise.all([
    getAccountsWithContext(connection, mints), getAccounts(connection, mints.map(metadataPda)), connection.getEpochInfo("confirmed"),
  ]);
  const out = new Map<string, QuoteMintInfo>();
  mints.forEach((address, i) => {
    const account = read.accounts[i];
    if (!account || !(account.owner.equals(TOKEN_PROGRAM_ID) || account.owner.equals(TOKEN_2022_PROGRAM_ID))) return;
    const mint = unpackMint(address, account, account.owner);
    const named = address.equals(NATIVE_MINT)
      ? { name: "Solana", symbol: "SOL" } // wrapped SOL is how LaunchLab takes SOL; people know it as SOL
      : (token2022Metadata(mint.tlvData) ?? metaplexMetadata(metadataAccounts[i]?.data));
    out.set(address.toBase58(), {
      mint: address,
      tokenProgram: account.owner,
      decimals: mint.decimals,
      name: named?.name || null,
      symbol: named?.symbol || null,
      freezeAuthority: mint.freezeAuthority,
      permanentDelegate: optional(getPermanentDelegate(mint)?.delegate),
      mintAuthority: mint.mintAuthority,
      controls: mintControls(mint, epochInfo.epoch),
    });
  });
  return { slot: read.slot, epoch: epochInfo.epoch, mints: out };
}

/** Like `getAccounts`, with the slot of the read: the lowest slot among the pages, since nothing read is older than that. */
async function getAccountsWithContext(connection: Connection, keys: PublicKey[]) {
  const accounts = [];
  let slot = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < keys.length; i += MULTIPLE_ACCOUNTS_MAX) {
    const { context, value } = await connection.getMultipleAccountsInfoAndContext(keys.slice(i, i + MULTIPLE_ACCOUNTS_MAX), "confirmed");
    accounts.push(...value);
    slot = Math.min(slot, context.slot);
  }
  return { slot: keys.length ? slot : await connection.getSlot("confirmed"), accounts };
}

function token2022Metadata(tlv: Buffer) {
  const data = getExtensionData(ExtensionType.TokenMetadata, tlv);
  if (!data) return null;
  const m = unpackTokenMetadata(data);
  return { name: clean(m.name), symbol: clean(m.symbol) };
}

/** Metaplex Metadata: key, update authority and mint, then borsh strings name and symbol (padded with NULs). */
function metaplexMetadata(data: Uint8Array | undefined) {
  if (!data || data.length < 1 + 32 + 32 + 8) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 1 + 32 + 32;
  const str = () => {
    const len = view.getUint32(offset, true);
    const s = new TextDecoder().decode(data.subarray(offset + 4, offset + 4 + len));
    offset += 4 + len;
    return clean(s);
  };
  return { name: str(), symbol: str() };
}

const clean = (s: string) => s.replace(/\0/g, "").trim();

/** Our curve rule's groups for each GlobalConfig, by group id, or null where the rule account doesn't exist yet. */
export async function readCurveRuleGroups(
  connection: Connection, program: PublicKey, platformConfig: PublicKey, globalConfigs: PublicKey[],
): Promise<Map<string, Map<number, RuleConstraint[]> | null>> {
  const pdas = launchlabPdas(program);
  const accounts = await getAccounts(connection, globalConfigs.map((g) => pdas.curveRule(platformConfig, g)));
  const out = new Map<string, Map<number, RuleConstraint[]> | null>();
  globalConfigs.forEach((g, i) => {
    const account = accounts[i];
    if (!account) return out.set(g.toBase58(), null);
    const rule = launchlabCoder.accounts.decode("PlatformCurveRule", account.data) as {
      groups: { group_id: number; constraints: { field: number; op: number; value: BN }[] }[];
    };
    out.set(g.toBase58(), new Map(rule.groups.map((x) => [x.group_id, x.constraints])));
  });
  return out;
}

/** Our curve rule's standard group (id 0) for each GlobalConfig, or null where the rule account doesn't exist yet. */
export async function readCurveRules(
  connection: Connection, program: PublicKey, platformConfig: PublicKey, globalConfigs: PublicKey[],
): Promise<Map<string, RuleConstraint[] | null>> {
  const groups = await readCurveRuleGroups(connection, program, platformConfig, globalConfigs);
  return new Map([...groups].map(([g, rule]) => [g, rule ? (rule.get(0) ?? []) : null]));
}
