import { PublicKey } from "@solana/web3.js";
import { METADATA_PROGRAM } from "./programs";

const find = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];
const seed = (s: string) => Buffer.from(s, "utf8");

/** LaunchLab program-derived addresses, parameterised by the program id so one set serves every cluster. */
export function launchlabPdas(program: PublicKey) {
  return {
    authority: find([seed("vault_auth_seed")], program),
    eventAuthority: find([seed("__event_authority")], program),
    platformConfig: (admin: PublicKey) => find([seed("platform_config"), admin.toBuffer()], program),
    curveRule: (platformConfig: PublicKey, globalConfig: PublicKey) =>
      find([seed("platform_curve_rule"), platformConfig.toBuffer(), globalConfig.toBuffer()], program),
    pool: (baseMint: PublicKey, quoteMint: PublicKey) => find([seed("pool"), baseMint.toBuffer(), quoteMint.toBuffer()], program),
    vault: (pool: PublicKey, mint: PublicKey) => find([seed("pool_vault"), pool.toBuffer(), mint.toBuffer()], program),
    platformFeeVault: (platformConfig: PublicKey, quoteMint: PublicKey) => find([platformConfig.toBuffer(), quoteMint.toBuffer()], program),
    creatorFeeVault: (creator: PublicKey, quoteMint: PublicKey) => find([creator.toBuffer(), quoteMint.toBuffer()], program),
  };
}

export const metadataPda = (mint: PublicKey) => find([seed("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()], METADATA_PROGRAM);
