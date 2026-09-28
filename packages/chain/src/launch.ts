import { ComputeBudgetProgram, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import type BN from "bn.js";
import { initializeV2Ix } from "./instructions";
import { launchlabPdas } from "./pda";

export type LaunchRequest = {
  program: PublicKey;
  platformConfig: PublicKey;
  globalConfig: PublicKey;
  quoteMint: PublicKey;
  /** SPL Token or Token-2022; tokenized stocks are Token-2022. */
  quoteTokenProgram: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  graduationTargetRaw: BN;
};

export type PreparedLaunch = {
  /** Base64 of a v0 transaction, already signed by the new mint; the Creator's wallet adds the fee-payer signature. */
  transaction: string;
  mint: PublicKey;
  pool: PublicKey;
  lastValidBlockHeight: number;
};

const LAUNCH_COMPUTE_UNITS = 400_000;

/**
 * Builds the launch transaction server-side (ADR 0003). The Creator pays and signs; the mint key signs here and is then discarded.
 * Callers that need the mint address before building (for the metadata URI) generate the key themselves.
 */
export async function prepareLaunch(connection: Connection, r: LaunchRequest, mint: Keypair = Keypair.generate()): Promise<PreparedLaunch> {
  const pool = launchlabPdas(r.program).pool(mint.publicKey, r.quoteMint);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: r.creator,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: LAUNCH_COMPUTE_UNITS }),
      initializeV2Ix({
        program: r.program,
        payer: r.creator,
        creator: r.creator,
        globalConfig: r.globalConfig,
        platformConfig: r.platformConfig,
        baseMint: mint.publicKey,
        quoteMint: r.quoteMint,
        quoteTokenProgram: r.quoteTokenProgram,
        name: r.name,
        symbol: r.symbol,
        uri: r.uri,
        graduationTargetRaw: r.graduationTargetRaw,
      }),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([mint]);
  return { transaction: Buffer.from(tx.serialize()).toString("base64"), mint: mint.publicKey, pool, lastValidBlockHeight };
}
