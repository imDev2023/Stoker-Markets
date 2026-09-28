// Paying an airdrop safely in many transactions: each wallet is paid by at most one transaction, however often the
// Creator retries, because a new transaction for a wallet is only handed out once every earlier one can no longer land.
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { decodeTokenTransfers, type RawTransaction } from "@launchpad/chain";
import type { AirdropPaymentStatus } from "@launchpad/contract";
import { airdropRecipients, launchDrafts, type Db } from "@launchpad/db";

type Recipient = typeof airdropRecipients.$inferSelect;
type Draft = typeof launchDrafts.$inferSelect;

const time = (blockTime: number | null) => new Date((blockTime ?? Math.floor(Date.now() / 1000)) * 1000);

/**
 * Marks the airdrop payments in a confirmed transaction: a checked transfer of exactly a wallet's amount from the
 * Creator's coin account to that wallet's coin account. Only the Creator can sign such a transfer. Idempotent.
 */
export async function indexAirdropPayments(db: Db, raw: RawTransaction): Promise<number> {
  const transfers = decodeTokenTransfers(raw);
  if (transfers.length === 0) return 0;
  const mints = [...new Set(transfers.map((t) => t.mint.toBase58()))];
  const drafts = await db.select({ mint: launchDrafts.mint, creator: launchDrafts.creator }).from(launchDrafts).where(inArray(launchDrafts.mint, mints));
  if (drafts.length === 0) return 0;
  const unpaid = await db
    .select()
    .from(airdropRecipients)
    .where(and(inArray(airdropRecipients.mint, drafts.map((d) => d.mint)), isNull(airdropRecipients.paidSignature)));
  const signature = raw.transaction.signatures[0]!;
  let paid = 0;
  for (const t of transfers) {
    const draft = drafts.find((d) => d.mint === t.mint.toBase58());
    if (!draft) continue;
    const ata = (owner: string) => getAssociatedTokenAddressSync(t.mint, new PublicKey(owner), false, t.tokenProgram);
    if (!t.source.equals(ata(draft.creator))) continue;
    const recipient = unpaid.find((r) => r.mint === draft.mint && r.amount === t.amount.toString() && t.destination.equals(ata(r.wallet)));
    if (!recipient) continue;
    const updated = await db
      .update(airdropRecipients)
      .set({ paidSignature: signature, paidAt: time(raw.blockTime) })
      .where(and(eq(airdropRecipients.mint, recipient.mint), eq(airdropRecipients.wallet, recipient.wallet), isNull(airdropRecipients.paidSignature)))
      .returning({ wallet: airdropRecipients.wallet });
    paid += updated.length;
  }
  return paid;
}

/** The Creator's coin account, which pays every airdrop wallet: its history holds every payment. */
export const airdropSource = (draft: Draft, tokenProgram: PublicKey) =>
  getAssociatedTokenAddressSync(new PublicKey(draft.mint), new PublicKey(draft.creator), false, tokenProgram);

/** Where one wallet's payment stands at a given block height. */
export function paymentStatus(r: Recipient, blockHeight: number | null): AirdropPaymentStatus {
  if (r.paidSignature) return "paid";
  if (r.sendableUntil !== null && blockHeight !== null && r.sendableUntil >= blockHeight) return "sending";
  return "unpaid";
}

/** Wallets handed out in a transaction that may have landed without being reported: only these need a scan. */
export const needsScan = (recipients: Recipient[]) => recipients.some((r) => !r.paidSignature && r.sendableUntil !== null);

/**
 * Claims the unpaid wallets for new transactions valid until `until`, but only those whose earlier transactions can
 * no longer land at `blockHeight`. Returns the wallets claimed; a concurrent claim takes some and leaves fewer here.
 */
export async function claimForSending(db: Db, mint: string, wallets: string[], blockHeight: number, until: number) {
  const claimed = await db
    .update(airdropRecipients)
    .set({ sendableUntil: until })
    .where(
      and(
        eq(airdropRecipients.mint, mint),
        inArray(airdropRecipients.wallet, wallets),
        isNull(airdropRecipients.paidSignature),
        or(isNull(airdropRecipients.sendableUntil), lt(airdropRecipients.sendableUntil, blockHeight)),
      ),
    )
    .returning({ wallet: airdropRecipients.wallet });
  return claimed.map((c) => c.wallet);
}
