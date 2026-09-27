import { PublicKey } from "@solana/web3.js";
import { AIRDROP_MAX_RECIPIENTS } from "@launchpad/contract";
import { parseUnits } from "./format";

export type AirdropLine = { wallet: string; amount: bigint };
export type ParsedAirdrop = { recipients: AirdropLine[]; total: bigint; problem: string | null };

// An address, then a comma, semicolon, tab or spaces, then an amount that may group its thousands with commas or spaces.
const LINE = /^([1-9A-HJ-NP-Za-km-z]{32,44})\s*[,;\t ]\s*([\d][\d, _]*(?:\.\d+)?)$/;

function isWallet(address: string) {
  try {
    return PublicKey.isOnCurve(new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}

/**
 * Reads the Creator's airdrop list: one wallet per line with the coins it gets, as pasted from a spreadsheet or typed.
 * Blank lines are skipped. The first line that can't be paid is reported by its number, in words the Creator can act on.
 */
export function parseAirdropList(text: string, decimals: number, creator: string | null): ParsedAirdrop {
  const recipients: AirdropLine[] = [];
  const seen = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const n = i + 1;
    const fail = (why: string): ParsedAirdrop => ({ recipients, total: 0n, problem: `Line ${n}: ${why}` });
    const match = LINE.exec(line);
    if (!match) return fail("write a wallet address, then the number of coins it gets.");
    const [, wallet, amountText] = match as unknown as [string, string, string];
    if (!isWallet(wallet)) return fail("that isn't a Solana wallet address.");
    if (wallet === creator) return fail("that's your own wallet, which keeps whatever the airdrop doesn't give away.");
    const earlier = seen.get(wallet);
    if (earlier !== undefined) return fail(`this wallet is already on line ${earlier}.`);
    const amount = parseUnits(amountText.replace(/[, _]/g, ""), decimals);
    if (amount === null) return fail(`the amount must be above zero, with up to ${decimals} decimal places.`);
    seen.set(wallet, n);
    recipients.push({ wallet, amount });
  }
  if (recipients.length > AIRDROP_MAX_RECIPIENTS)
    return { recipients, total: 0n, problem: `An airdrop can pay up to ${AIRDROP_MAX_RECIPIENTS} wallets; this list has ${recipients.length}.` };
  return { recipients, total: recipients.reduce((s, r) => s + r.amount, 0n), problem: null };
}
