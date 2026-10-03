import { isNotNull } from "drizzle-orm";
import { WSOL_MINT } from "@launchpad/chain";
import { quoteAssets, type Db } from "@launchpad/db";

const WSOL = WSOL_MINT.toBase58();
const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * Whether an amount of an asset is worth acting on: at least the minimum in SOL at the Quote Registry's latest price.
 * An asset without a price always is, whenever there is any, since there is no telling what it is worth.
 */
export async function valuer(db: Db, minLamports: bigint) {
  const prices = new Map(
    (await db.select({ mint: quoteAssets.mint, priceSol: quoteAssets.priceSol, decimals: quoteAssets.decimals }).from(quoteAssets).where(isNotNull(quoteAssets.priceSol)))
      .map((q) => [q.mint, q]),
  );
  return (mint: string, amount: bigint) => {
    if (amount <= 0n) return false;
    if (mint === WSOL) return amount >= minLamports;
    const q = prices.get(mint);
    if (!q) return true;
    // amount / 10^decimals * priceSol SOL, compared in lamports without floating point.
    const [whole, fraction = ""] = q.priceSol!.split(".");
    const price = BigInt(whole! + fraction);
    const lamports = (amount * price * LAMPORTS_PER_SOL) / (10n ** BigInt(q.decimals) * 10n ** BigInt(fraction.length));
    return lamports >= minLamports;
  };
}
