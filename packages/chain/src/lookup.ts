import { ComputeBudgetProgram, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, type AddressLookupTableAccount, type Connection } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { launchlabPdas } from "./pda";
import { METADATA_PROGRAM } from "./programs";

/** A Quote Asset's accounts that every launch against it names. */
export type LookupQuote = { globalConfig: PublicKey; quoteMint: PublicKey };

/**
 * The accounts the Platform Lookup Table holds: everything a launch names that is the same for every launch, plus each
 * listed Quote Asset's own four. A launch transaction names about 25 accounts; through the table each of these costs
 * 1 byte instead of 32. The shared ones alone bring a launch with a First Buy within Solana's 1,232 bytes for any
 * Quote Asset except SOL, whose First Buy also opens and closes a wrapped-SOL account: SOL's entries are required.
 * A table holds at most 256 addresses, so on mainnet list SOL and the most used Quote Assets, not all 571.
 */
export function platformLookupAddresses(program: PublicKey, platformConfig: PublicKey, quotes: LookupQuote[]): PublicKey[] {
  const pdas = launchlabPdas(program);
  const shared = [
    program, pdas.authority, pdas.eventAuthority, platformConfig,
    TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, METADATA_PROGRAM,
    SystemProgram.programId, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram.programId,
  ];
  const perQuote = quotes.flatMap((q) => [
    q.globalConfig, q.quoteMint, pdas.curveRule(platformConfig, q.globalConfig), pdas.platformFeeVault(platformConfig, q.quoteMint),
  ]);
  const seen = new Set<string>();
  return [...shared, ...perQuote].filter((k) => !seen.has(k.toBase58()) && Boolean(seen.add(k.toBase58())));
}

/** The Platform Lookup Table as it is on-chain now; missing or deactivated is a configuration error. */
export async function loadLookupTable(connection: Connection, address: PublicKey): Promise<AddressLookupTableAccount> {
  const { value } = await connection.getAddressLookupTable(address, { commitment: "confirmed" });
  if (!value || !value.isActive()) throw new Error(`the Platform Lookup Table ${address.toBase58()} does not exist or is deactivated`);
  return value;
}
