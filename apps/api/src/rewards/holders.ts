// Who holds a Reward Launch's coin, read from the chain: every Token-2022 account of the mint, with what it holds and
// what tax is withheld in it. Program-owned accounts (the curve's vault, the pool's vault, the lock program's) are not
// holders; neither is the operations wallet, which only ever holds collected tax on its way to holders.
import { PublicKey, type Connection } from "@solana/web3.js";
import { getTransferFeeAmount, TOKEN_2022_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

export type CoinAccount = {
  address: PublicKey;
  owner: PublicKey;
  amount: bigint;
  /** Reward Tax withheld in this account, waiting to be harvested to the mint. */
  withheld: bigint;
};

/** Every token account of a Token-2022 mint. */
export async function readCoinAccounts(connection: Connection, mint: PublicKey): Promise<CoinAccount[]> {
  const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
  });
  return accounts.map(({ pubkey, account }) => {
    const a = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID);
    return { address: pubkey, owner: a.owner, amount: a.amount, withheld: getTransferFeeAmount(a)?.withheldAmount ?? 0n };
  });
}

/**
 * The accounts that count as holders: wallets (owners on the ed25519 curve, so no program's vault) other than the
 * operations wallet, holding at least `minHolding`.
 */
export function eligibleHolders(accounts: CoinAccount[], operationsWallet: PublicKey, minHolding: bigint) {
  const byWallet = new Map<string, bigint>();
  for (const a of accounts) {
    if (a.amount === 0n || a.owner.equals(operationsWallet) || !PublicKey.isOnCurve(a.owner.toBytes())) continue;
    byWallet.set(a.owner.toBase58(), (byWallet.get(a.owner.toBase58()) ?? 0n) + a.amount);
  }
  return [...byWallet]
    .filter(([, amount]) => amount >= minHolding)
    .map(([wallet, amount]) => ({ wallet, amount }))
    .sort((a, b) => (a.amount === b.amount ? a.wallet.localeCompare(b.wallet) : a.amount > b.amount ? -1 : 1));
}
