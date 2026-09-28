// What a burn transaction did, read back from the chain for the Ledger: the SOL that left the operations wallet (its
// balance change less the network fee; rent it paid comes back in the same transaction) and the coins the burn
// instruction destroyed.
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { RawTransaction } from "@launchpad/chain";
import { WSOL_MINT } from "@launchpad/chain";
import { ledgerEntries, type Db } from "@launchpad/db";
import type { Config } from "../env";
import { fetchRawTransaction } from "../indexer";

const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);
const BURN = 8;
const BURN_CHECKED = 15;
/** Where burned coins are recorded as having gone: nowhere, the system program's address standing in. */
export const BURN_DESTINATION = PublicKey.default;

type Raw = RawTransaction & { meta: (NonNullable<RawTransaction["meta"]> & { fee: number; preBalances: number[]; postBalances: number[] }) | null };

/** The SOL spent and the coins burned by a confirmed burn transaction the operations wallet paid for. */
export function decodeBurn(raw: RawTransaction, operationsWallet: PublicKey, mint: PublicKey) {
  const tx = raw as Raw;
  const meta = tx.meta;
  if (!meta || meta.err) return null;
  const keys = [...tx.transaction.message.accountKeys, ...(meta.loadedAddresses?.writable ?? []), ...(meta.loadedAddresses?.readonly ?? [])];
  const opsIndex = keys.indexOf(operationsWallet.toBase58());
  if (opsIndex < 0) return null;
  // Closing the wallet's coin account (opened earlier, by a Fee Key collection say) gives its rent back in the same
  // transaction; that refund is not part of what the buy cost.
  let refunds = 0n;
  for (const b of meta.preTokenBalances ?? []) {
    if (b.accountIndex === undefined || b.owner !== operationsWallet.toBase58() || meta.postBalances[b.accountIndex] !== 0) continue;
    refunds += BigInt(meta.preBalances[b.accountIndex] ?? 0);
  }
  const lamports = BigInt(meta.preBalances[opsIndex]!) - BigInt(meta.postBalances[opsIndex]!) - BigInt(meta.fee) + refunds;
  let amount = 0n;
  let decimals: number | null = null;
  for (const ix of [...tx.transaction.message.instructions, ...(meta.innerInstructions ?? []).flatMap((g) => g.instructions)]) {
    if (!TOKEN_PROGRAMS.has(keys[ix.programIdIndex]!)) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if ((data[0] !== BURN && data[0] !== BURN_CHECKED) || data.length < 9) continue;
    if (keys[ix.accounts[1]!] !== mint.toBase58()) continue;
    amount += data.readBigUInt64LE(1);
    if (data[0] === BURN_CHECKED) decimals = data[9]!;
  }
  decimals ??= meta.postTokenBalances?.find((b) => b.mint === mint.toBase58())?.uiTokenAmount.decimals ?? null;
  return { lamports, amount, decimals };
}

/**
 * Records a burn on the Ledger: the SOL spent (kind `burn` or `flywheel`, the wrapped-SOL mint, from the operations
 * wallet to the coin's mint as the market) and the coins destroyed (same kind, the coin's mint, to the burn address).
 */
export async function recordBurn(db: Db, cfg: Config, signature: string, kind: "burn" | "flywheel", mint: PublicKey, operationsWallet: PublicKey) {
  const raw = await fetchRawTransaction(cfg.rpcUrl, signature);
  if (!raw) throw new Error(`burn ${signature} not found after confirmation`);
  const decoded = decodeBurn(raw, operationsWallet, mint);
  if (!decoded) throw new Error(`burn ${signature} could not be decoded`);
  const time = new Date((raw.blockTime ?? Math.floor(Date.now() / 1000)) * 1000);
  await db
    .insert(ledgerEntries)
    .values([
      {
        signature, eventIndex: 0, kind, assetMint: WSOL_MINT.toBase58(), assetDecimals: 9, amount: decoded.lamports.toString(),
        source: operationsWallet.toBase58(), destination: mint.toBase58(), launchMint: kind === "flywheel" ? mint.toBase58() : null, slot: raw.slot, blockTime: time,
      },
      {
        signature, eventIndex: 1, kind, assetMint: mint.toBase58(), assetDecimals: decoded.decimals ?? 6, amount: decoded.amount.toString(),
        source: operationsWallet.toBase58(), destination: BURN_DESTINATION.toBase58(), launchMint: kind === "flywheel" ? mint.toBase58() : null, slot: raw.slot, blockTime: time,
      },
    ])
    .onConflictDoNothing();
  return decoded;
}
