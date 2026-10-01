// Creates or extends the Platform Lookup Table with the operations keypair from a list of Quote Asset mints (runbook,
// section 3), reusing `ensureLookupTable` and `platformLookupAddresses`. SOL is always listed, since a SOL First Buy
// only fits a transaction with SOL's own accounts in the table. Read-only on secrets: the operations keypair signs and is
// never printed.
//
//   pnpm --filter @launchpad/mainnet lookup-table --rpc <url> --cluster mainnet --operations operations.json \
//     --admin <pubkey or keypair.json> --quotes <mint>,<mint>,...
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { launchlabPdas, platformLookupAddresses, programsFor, WSOL_MINT, type Cluster } from "@launchpad/chain";
import { ensureLookupTable } from "@launchpad/localnet";
import { clusterArg, flags, keypairArg, publicKeyArg } from "./platform-config";

/** An address lookup table holds at most this many addresses. */
export const LOOKUP_TABLE_MAX_ADDRESSES = 256;

/** The addresses the Platform Lookup Table must hold for these Quote Assets: the shared ones, then SOL's, then each mint's. */
export function platformLookupTableAddresses(cluster: Cluster, admin: PublicKey, quoteMints: PublicKey[]): PublicKey[] {
  const program = programsFor(cluster).launchlab;
  const pdas = launchlabPdas(program);
  const seen = new Set<string>();
  const mints = [WSOL_MINT, ...quoteMints].filter((m) => !seen.has(m.toBase58()) && Boolean(seen.add(m.toBase58())));
  const addresses = platformLookupAddresses(program, pdas.platformConfig(admin), mints.map((quoteMint) => ({ quoteMint, globalConfig: pdas.globalConfig(quoteMint) })));
  if (addresses.length > LOOKUP_TABLE_MAX_ADDRESSES)
    throw new Error(`${mints.length} Quote Assets need ${addresses.length} addresses; a lookup table holds ${LOOKUP_TABLE_MAX_ADDRESSES}. List SOL and the busiest ones only.`);
  return addresses;
}

/**
 * The Platform Lookup Table with every address these Quote Assets need: the operations wallet's existing table extended
 * with what is missing, or a new one. Returns once the last extension is rooted, so the table is usable.
 */
export async function ensurePlatformLookupTable(connection: Connection, cluster: Cluster, operations: Keypair, admin: PublicKey, quoteMints: PublicKey[]) {
  const addresses = platformLookupTableAddresses(cluster, admin, quoteMints);
  const table = await ensureLookupTable(connection, operations, addresses);
  const state = (await connection.getAddressLookupTable(table, { commitment: "confirmed" })).value!;
  return { table, addresses: state.state.addresses.length };
}

async function main() {
  const f = flags(process.argv.slice(2));
  const need = (name: string) => {
    const v = f.get(name);
    if (!v) throw new Error(`--${name} is required`);
    return v;
  };
  const connection = new Connection(need("rpc"), "confirmed");
  const cluster = clusterArg(f.get("cluster"));
  const operations = keypairArg(need("operations"));
  const admin = publicKeyArg(need("admin"));
  const quotes = (f.get("quotes") ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => new PublicKey(s));
  const { table, addresses } = await ensurePlatformLookupTable(connection, cluster, operations, admin, quotes);
  console.log(`Platform Lookup Table (PLATFORM_LOOKUP_TABLE): ${table.toBase58()}`);
  console.log(`${addresses} addresses, SOL and ${quotes.length} other Quote Assets; a new address is usable a minute after it is added.`);
}

if (process.argv[1] && /lookup-table\.ts$/.test(process.argv[1])) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
