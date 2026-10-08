import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount, unpackMint } from "@solana/spl-token";

const TOKEN_PROGRAMS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

/** A fee vault LaunchLab keeps per Quote Asset, and what it holds right now. */
export type FeeVault = {
  quoteMint: PublicKey;
  vault: PublicKey;
  /** Raw units of the Quote Asset; zero when the vault has never been opened. */
  balance: bigint;
  quoteDecimals: number;
  quoteTokenProgram: PublicKey;
};

/** Reads fee vaults with their Quote Assets' decimals and token programs; an address that is not a token mint is left out. */
export async function readFeeVaults(connection: Connection, vaults: { quoteMint: PublicKey; vault: PublicKey }[]): Promise<FeeVault[]> {
  if (vaults.length === 0) return [];
  const infos = await connection.getMultipleAccountsInfo([...vaults.map((v) => v.quoteMint), ...vaults.map((v) => v.vault)], "confirmed");
  return vaults.flatMap(({ quoteMint, vault }, i) => {
    const decimals = mintDecimals(quoteMint, infos[i] ?? null);
    if (decimals === null) return [];
    return [{
      quoteMint,
      vault,
      balance: vaultBalance(vault, infos[vaults.length + i] ?? null),
      quoteDecimals: decimals,
      quoteTokenProgram: infos[i]!.owner,
    }];
  });
}

function mintDecimals(address: PublicKey, info: AccountInfo<Buffer> | null) {
  if (!info || !TOKEN_PROGRAMS.some((p) => p.equals(info.owner))) return null;
  try {
    return unpackMint(address, info, info.owner).decimals;
  } catch {
    return null; // a token account, not a mint
  }
}

function vaultBalance(vault: PublicKey, info: AccountInfo<Buffer> | null) {
  return info ? unpackAccount(vault, info, info.owner).amount : 0n;
}
