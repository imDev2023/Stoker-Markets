import type { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { getEpochFee, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import BN from "bn.js";

/**
 * A Token-2022 transfer fee: the issuer's cut of every transfer of the mint, withheld from what arrives. A tokenized
 * stock or a reward-style coin used as a Quote Asset can carry one, and so does every Reward Launch's coin (its Reward
 * Tax). LaunchLab and CPMM move tokens with `transfer_checked`, so the fee applies on the way into a curve or pool and
 * on the way out, and every quote has to allow for it (issue #29).
 */
export type TransferFee = {
  /** Basis points of the amount transferred. */
  bps: number;
  /** The fee is never more than this, in raw units. */
  maximumFee: BN;
};

const BPS = new BN(10_000);
const ceilDiv = (a: BN, b: BN) => a.add(b).subn(1).div(b);

/** The fee withheld from a transfer of `amount`, as spl-token's `calculateFee` computes it. */
export function withheldFee(amount: BN, fee: TransferFee | null): BN {
  if (!fee || fee.bps === 0 || amount.isZero()) return new BN(0);
  const raw = ceilDiv(amount.muln(fee.bps), BPS);
  return BN.min(raw, fee.maximumFee);
}

/** The smallest amount to transfer so that at least `net` arrives after the fee. */
export function grossForNet(net: BN, fee: TransferFee | null): BN {
  if (!fee || fee.bps === 0 || net.isZero()) return net;
  let gross = ceilDiv(net.mul(BPS), BPS.subn(fee.bps));
  // Once the fee hits its cap, the gross is the net plus that cap.
  if (withheldFee(gross, fee).eq(fee.maximumFee)) gross = net.add(fee.maximumFee);
  // Rounding can leave the net a unit short; step up until it arrives.
  while (gross.sub(withheldFee(gross, fee)).lt(net)) gross = gross.addn(1);
  return gross;
}

/** The transfer fee a mint charges at `epoch`, from its account; null for SPL Token mints and mints without one. */
export function transferFeeOf(mint: PublicKey, info: AccountInfo<Buffer> | null, epoch: number): TransferFee | null {
  if (!info || !info.owner.equals(TOKEN_2022_PROGRAM_ID)) return null;
  const config = getTransferFeeConfig(unpackMint(mint, info, TOKEN_2022_PROGRAM_ID));
  if (!config) return null;
  const fee = getEpochFee(config, BigInt(epoch));
  if (fee.transferFeeBasisPoints === 0) return null;
  return { bps: fee.transferFeeBasisPoints, maximumFee: new BN(fee.maximumFee.toString()) };
}

/** The transfer fee of each mint right now, by mint address; a mint that doesn't exist is null. */
export async function readTransferFees(connection: Connection, mints: PublicKey[]): Promise<Map<string, TransferFee | null>> {
  if (mints.length === 0) return new Map();
  const [infos, { epoch }] = await Promise.all([connection.getMultipleAccountsInfo(mints, "confirmed"), connection.getEpochInfo("confirmed")]);
  return new Map(mints.map((m, i) => [m.toBase58(), transferFeeOf(m, infos[i] ?? null, epoch)]));
}
