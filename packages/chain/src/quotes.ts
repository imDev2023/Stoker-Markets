import { PublicKey, type Connection } from "@solana/web3.js";
import { ExtensionType, getExtensionData, getPermanentDelegate, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { unpack as unpackTokenMetadata } from "@solana/spl-token-metadata";
import type BN from "bn.js";
import { launchlabCoder } from "./coder";
import { launchlabPdas, metadataPda } from "./pda";
import type { RuleConstraint } from "./shape";

/** A LaunchLab GlobalConfig: Raydium's per-quote-mint config that makes a token usable as a Quote Asset. */
export type GlobalConfigInfo = { address: PublicKey; quoteMint: PublicKey; index: number };

/**
 * Every constant-product GlobalConfig of the program, one per quote mint (the lowest index where Raydium made several,
 * as devnet has for SOL). Our launch shape is constant-product, so other curve types are not Quote Assets for us.
 */
export async function listGlobalConfigs(connection: Connection, program: PublicKey): Promise<GlobalConfigInfo[]> {
  const accounts = await connection.getProgramAccounts(program, { filters: [{ memcmp: launchlabCoder.accounts.memcmp("GlobalConfig") }] });
  const byMint = new Map<string, GlobalConfigInfo>();
  for (const { pubkey, account } of accounts) {
    const c = launchlabCoder.accounts.decode("GlobalConfig", account.data) as { curve_type: number; index: number; quote_mint: PublicKey };
    if (c.curve_type !== 0) continue;
    const seen = byMint.get(c.quote_mint.toBase58());
    if (!seen || c.index < seen.index) byMint.set(c.quote_mint.toBase58(), { address: pubkey, quoteMint: c.quote_mint, index: c.index });
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
};

const MULTIPLE_ACCOUNTS_MAX = 100;

async function getAccounts(connection: Connection, keys: PublicKey[]) {
  const out = [];
  for (let i = 0; i < keys.length; i += MULTIPLE_ACCOUNTS_MAX)
    out.push(...(await connection.getMultipleAccountsInfo(keys.slice(i, i + MULTIPLE_ACCOUNTS_MAX), "confirmed")));
  return out;
}

/** Reads each quote mint's token program, decimals and on-chain name and symbol. Mints that don't exist are left out. */
export async function readQuoteMints(connection: Connection, mints: PublicKey[]): Promise<Map<string, QuoteMintInfo>> {
  const [mintAccounts, metadataAccounts] = await Promise.all([getAccounts(connection, mints), getAccounts(connection, mints.map(metadataPda))]);
  const out = new Map<string, QuoteMintInfo>();
  mints.forEach((address, i) => {
    const account = mintAccounts[i];
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
      permanentDelegate: getPermanentDelegate(mint)?.delegate ?? null,
    });
  });
  return out;
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

/** Our curve rule's first group for each GlobalConfig, or null where the rule account doesn't exist yet. */
export async function readCurveRules(
  connection: Connection, program: PublicKey, platformConfig: PublicKey, globalConfigs: PublicKey[],
): Promise<Map<string, RuleConstraint[] | null>> {
  const pdas = launchlabPdas(program);
  const accounts = await getAccounts(connection, globalConfigs.map((g) => pdas.curveRule(platformConfig, g)));
  const out = new Map<string, RuleConstraint[] | null>();
  globalConfigs.forEach((g, i) => {
    const account = accounts[i];
    if (!account) return out.set(g.toBase58(), null);
    const rule = launchlabCoder.accounts.decode("PlatformCurveRule", account.data) as {
      groups: { group_id: number; constraints: { field: number; op: number; value: BN }[] }[];
    };
    out.set(g.toBase58(), rule.groups.find((x) => x.group_id === 0)?.constraints ?? []);
  });
  return out;
}
