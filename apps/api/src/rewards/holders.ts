// Who holds a coin, read from the chain: every token account of the mint under the mint's own token program, with what
// it holds and, for a Reward Launch's coin, what tax is withheld in it. Program-owned accounts (the curve's vault, the
// pool's vault, the lock program's) are not holders; neither is the operations wallet, which holds a coin only on its
// way somewhere else, such as collected tax on its way to holders.
import { PublicKey, type Connection, type GetProgramAccountsFilter } from "@solana/web3.js";
import { ACCOUNT_SIZE, getTransferFeeAmount, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

export type CoinAccount = {
  address: PublicKey;
  owner: PublicKey;
  amount: bigint;
  /** Reward Tax withheld in this account, waiting to be harvested to the mint; nothing for a coin without a Reward Tax. */
  withheld: bigint;
};

/**
 * Every token account of a coin. A standard coin is a classic SPL Token mint and a Reward Launch's coin a Token-2022
 * one, so the accounts are read from the program that owns the mint: the one the caller names when it already knows
 * (a Reward Launch is always Token-2022), or else the mint's owner as the chain has it.
 */
export async function readCoinAccounts(connection: Connection, mint: PublicKey, tokenProgram?: PublicKey): Promise<CoinAccount[]> {
  const program = tokenProgram ?? (await tokenProgramOf(connection, mint));
  const filters: GetProgramAccountsFilter[] = [{ memcmp: { offset: 0, bytes: mint.toBase58() } }];
  // The classic program's token accounts are all one size, which also tells them from its mints and multisigs and lets
  // a node answer from its index of accounts by mint. Token-2022 accounts grow with their extensions, so no size fits.
  if (program.equals(TOKEN_PROGRAM_ID)) filters.unshift({ dataSize: ACCOUNT_SIZE });
  const accounts = await connection.getProgramAccounts(program, { commitment: "confirmed", filters });
  return accounts.map(({ pubkey, account }) => {
    const a = unpackAccount(pubkey, account, program);
    // A classic account carries no extensions, so nothing is ever withheld in it.
    return { address: pubkey, owner: a.owner, amount: a.amount, withheld: getTransferFeeAmount(a)?.withheldAmount ?? 0n };
  });
}

/** The token program a mint lives under, read from the chain: the classic one or Token-2022. */
async function tokenProgramOf(connection: Connection, mint: PublicKey) {
  const owner = (await connection.getAccountInfo(mint, "confirmed"))?.owner;
  if (!owner) throw new Error(`mint ${mint.toBase58()} does not exist`);
  if (!owner.equals(TOKEN_PROGRAM_ID) && !owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error(`${mint.toBase58()} is not a token mint: ${owner.toBase58()} owns it`);
  return owner;
}

export type Holder = { wallet: string; amount: bigint };

/**
 * What each wallet holds of a coin, from its accounts: wallets (owners on the ed25519 curve, so no program's vault)
 * other than the operations wallet, with anything at all. These are the wallets a Holding Check records (ADR 0022),
 * whatever they hold: the minimum holding decides who is paid in a round, not whose coins age.
 */
export function walletBalances(accounts: CoinAccount[], operationsWallet: PublicKey): Map<string, bigint> {
  const byWallet = new Map<string, bigint>();
  for (const a of accounts) {
    if (a.amount === 0n || a.owner.equals(operationsWallet) || !PublicKey.isOnCurve(a.owner.toBytes())) continue;
    byWallet.set(a.owner.toBase58(), (byWallet.get(a.owner.toBase58()) ?? 0n) + a.amount);
  }
  return byWallet;
}

/**
 * The accounts that count as holders in a round: wallets (owners on the ed25519 curve, so no program's vault) other
 * than the operations wallet, holding at least `minHolding`.
 */
export function eligibleHolders(accounts: CoinAccount[], operationsWallet: PublicKey, minHolding: bigint): Holder[] {
  return [...walletBalances(accounts, operationsWallet)]
    .filter(([, amount]) => amount >= minHolding)
    .map(([wallet, amount]) => ({ wallet, amount }))
    .sort((a, b) => (a.amount === b.amount ? a.wallet.localeCompare(b.wallet) : a.amount > b.amount ? -1 : 1));
}
