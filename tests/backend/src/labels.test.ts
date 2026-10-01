// Quote Risk Labels (#11): facts about a Quote Asset read from its mint (authorities and Token-2022 extensions) and from
// a token list, shown next to it and never used to block a launch or a trade. They refresh with the Quote Registry, and
// the Indexer re-reads a mint the moment a delivered transaction could have changed it.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { AuthorityType, TOKEN_2022_PROGRAM_ID, createSetAuthorityInstruction, createSetTransferFeeInstruction } from "@solana/spl-token";
import { QuoteAsset, type QuoteLabel } from "@launchpad/contract";
import { LOCAL_QUOTES, TAXED_QUOTE_FEE_BPS, localnetKeys, send } from "@launchpad/localnet";
import { connection, deliverWebhook, env, fundedWallet, launch, listQuotes, refreshQuoteRegistry } from "./client";

const MINT = "Read from the mint on-chain";
const LIST = "From the local token list";

async function labelsOf(mint: PublicKey) {
  const res = await fetch(`${env().apiUrl}/v1/quotes/${mint.toBase58()}`);
  expect(res.status).toBe(200);
  return QuoteAsset.parse(await res.json()).labels;
}

const summary = (labels: QuoteLabel[] | null) => labels?.map((l) => [l.kind, l.severity, l.title, l.source]);

describe("Quote Risk Labels", () => {
  it("are read from each mint's authorities and Token-2022 extensions, and from the token list", async () => {
    await refreshQuoteRegistry();
    const quotes = Object.fromEntries((await listQuotes()).map((q) => [q.symbol, q]));
    // SOL and a plain SPL token on the verified list: checked, nothing to flag.
    expect(quotes.SOL!.labels).toEqual([]);
    expect(quotes.JTO!.labels).toEqual([]);
    // A stablecoin's issuer keeps the freeze authority.
    expect(summary(quotes.USDC!.labels)).toEqual([["freeze", "caution", "Can freeze wallets", MINT]]);
    expect(quotes.USDC!.labels![0]!.detail).toBe("The issuer (7dGb…Crar) can freeze any wallet's USDC, which would stop that wallet buying, selling or claiming.");
    // A tokenized stock carries every issuer control xStocks put on their mints.
    expect(summary(quotes.NVDAx!.labels)).toEqual([
      ["freeze", "caution", "Can freeze wallets", MINT],
      ["permanent_delegate", "caution", "Issuer can move tokens", MINT],
      ["pausable", "caution", "Can pause transfers", MINT],
      ["transfer_hook", "caution", "Can add a transfer hook", MINT],
      ["default_frozen", "caution", "Can freeze new wallets by default", MINT],
      ["scaled_balance", "info", "Scaled balances", MINT],
    ]);
    const byKind = Object.fromEntries(quotes.NVDAx!.labels!.map((l: QuoteLabel) => [l.kind, l.detail]));
    expect(byKind.permanent_delegate).toBe("The issuer (5aMN…FvEq) can move or burn NVDAx from any wallet without its owner's signature.");
    expect(byKind.pausable).toBe("The issuer (JDq1…xJNs) can stop every transfer of NVDAx at any time; buys, sells and claims fail while it is paused.");
    expect(byKind.transfer_hook).toBe("The issuer (5aMN…FvEq) can attach a program that runs on every transfer of NVDAx; trades and claims could then need extra accounts or fail.");
    expect(byKind.default_frozen).toBe("New NVDAx accounts open unfrozen today, but the issuer can make every new one start frozen until it approves it.");
    expect(byKind.scaled_balance).toMatch(/^NVDAx balances are shown through a multiplier \(1\.0009 today\) its issuer changes on dividends and splits; curves and prices here work in raw units\.$/);
    // A pump.fun coin the token list doesn't know: not verified, no liquidity known.
    expect(summary(quotes.BULLWHALE!.labels)).toEqual([
      ["unverified", "caution", "Not on the verified list", LIST],
      ["low_liquidity", "caution", "Unknown liquidity", LIST],
    ]);
    // The taxed quote: its issuer's fee, which the issuer can still change, and a thin market on the list.
    expect(summary(quotes.TAXQ!.labels)).toEqual([
      ["unverified", "caution", "Not on the verified list", LIST],
      ["low_liquidity", "caution", "Low liquidity", LIST],
      ["transfer_fee", "info", "1% transfer fee", MINT],
    ]);
    const taxq = Object.fromEntries(quotes.TAXQ!.labels!.map((l: QuoteLabel) => [l.kind, l.detail]));
    expect(taxq.transfer_fee).toMatch(/^The issuer withholds 1% of every transfer of TAXQ, on the way into a curve or pool and out of it\. The issuer \([1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}\) can change the fee\.$/);
    expect(taxq.low_liquidity).toBe("About $25,000 of TAXQ is in the markets the local token list tracks, so its price can move a lot on one trade.");
    expect(taxq.unverified).toBe("TAXQ is not on the local token list's verified list; check its mint address before trusting the name.");
  });

  it("never block a launch or a trade: a labelled Quote Asset is launchable like any other", async () => {
    const quotes = Object.fromEntries((await listQuotes()).map((q) => [q.symbol, q]));
    expect(quotes.NVDAx!.labels!.length).toBeGreaterThan(0);
    expect(quotes.NVDAx).toMatchObject({ launchable: true, reason: null });
    expect(quotes.TAXQ).toMatchObject({ launchable: true, reason: null });
    const { prepared } = await launch(await fundedWallet(), { symbol: "LBL", quoteMint: LOCAL_QUOTES.NVDAx.toBase58() });
    expect(prepared.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("update as soon as a transaction that changed the mint is delivered, without waiting for the refresh", async () => {
    const { admin } = localnetKeys();
    const taxq = LOCAL_QUOTES.TAXQ;
    const fee = async () => (await labelsOf(taxq))!.find((l) => l.kind === "transfer_fee")!;
    expect((await fee()).title).toBe("1% transfer fee");

    // The issuer schedules a higher fee (Token-2022 applies it two epochs on). The webhook delivers the transaction as
    // it would any other, and the Quote Asset's labels say so at once.
    const maximum = BigInt("1000000000000000");
    const raise = await send(connection(), [createSetTransferFeeInstruction(taxq, admin.publicKey, [], 200, maximum, TOKEN_2022_PROGRAM_ID)], [admin]);
    expect((await deliverWebhook([raise])).status).toBe(200);
    expect(await fee()).toMatchObject({ title: "1% transfer fee, changing to 2%" });
    expect((await fee()).detail).toMatch(/^The issuer withholds 1% of every transfer of TAXQ, on the way into a curve or pool and out of it\. It changes to 2% from epoch \d+\. The issuer \(.*\) can change the fee\.$/);

    // Back to 1% before it can take effect, so the rest of the suite sees the fee it expects; the refresh agrees.
    const lower = await send(connection(), [createSetTransferFeeInstruction(taxq, admin.publicKey, [], TAXED_QUOTE_FEE_BPS, maximum, TOKEN_2022_PROGRAM_ID)], [admin]);
    await deliverWebhook([lower]);
    expect((await fee()).title).toBe("1% transfer fee");
    await refreshQuoteRegistry();
    expect((await fee()).title).toBe("1% transfer fee");
  });

  it("follow an authority the issuer gives up", async () => {
    // The withdraw-withheld authority is not a label; giving it up changes nothing. The fee-config authority is.
    const { admin } = localnetKeys();
    const before = (await labelsOf(LOCAL_QUOTES.TAXQ))!.find((l) => l.kind === "transfer_fee")!;
    expect(before.detail).toMatch(/can change the fee\.$/);
    // A transaction that names the mint but only reads it (a transfer, a trade) is not a change: nothing is re-read,
    // and the labels stay as they were.
    const trader = await fundedWallet();
    const { signature } = await launch(trader, { symbol: "TXR", quoteMint: LOCAL_QUOTES.TAXQ.toBase58() });
    await deliverWebhook([signature]);
    expect((await labelsOf(LOCAL_QUOTES.TAXQ))!.find((l) => l.kind === "transfer_fee")).toEqual(before);
    // Only the fee-config authority is given up here; the mint authority stays with the admin for `mintLocalQuote`.
    // This is permanent on this chain, so it runs last among the TAXQ tests.
    const giveUp = await send(connection(), [
      createSetAuthorityInstruction(LOCAL_QUOTES.TAXQ, admin.publicKey, AuthorityType.TransferFeeConfig, null, [], TOKEN_2022_PROGRAM_ID),
    ], [admin]);
    await deliverWebhook([giveUp]);
    const after = (await labelsOf(LOCAL_QUOTES.TAXQ))!.find((l) => l.kind === "transfer_fee")!;
    expect(after.title).toBe("1% transfer fee");
    expect(after.detail).toBe("The issuer withholds 1% of every transfer of TAXQ, on the way into a curve or pool and out of it.");
  });
});
