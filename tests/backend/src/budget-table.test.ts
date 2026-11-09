// The Budget Table (#187, ADR 0019): what the platform keeps after the Creators' share is divided by one versioned
// table whose shares sum to 100%. A version is announced ahead like a fee change, and its shares apply only to what
// is collected while it is in force, so every row's allotment can be redone from the Ledger and the versions alone.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { BUDGET_ROWS, BudgetsPage, BudgetTableVersion, BurnsPage, PlatformInfo, SPENDING_ROWS, type BudgetRow, type BudgetShares } from "@launchpad/contract";
import { connection, deliverWebhook, env, fundedWallet, launchedCoin, SOL, trade } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const budgets = async () => BudgetsPage.parse(await (await api("/v1/budgets")).json());
const published = async () => PlatformInfo.parse(await (await api("/v1/platform")).json()).budgetTable;
const announce = (shares: BudgetShares, effectiveAt: Date, note?: string) =>
  api("/v1/operator/budget-table", { method: "POST", headers: operator(), body: JSON.stringify({ shares, effectiveAt: effectiveAt.toISOString(), note }) });

/** The first version: what every deployment ran from its settings before the table (the migration writes it). */
const FIRST: BudgetShares = { burn: 6000, flywheel: 500, rebates: 0, referrals: 0, integrators: 0, treasury: 3500 };
const lead = () => env().feeChangeLeadSeconds * 1000;
const rowOf = (page: BudgetsPage, row: BudgetRow) => page.rows.find((r) => r.row === row)!;
const share = (lamports: bigint, bps: number) => (lamports * BigInt(bps)) / 10_000n;

async function runCollector() {
  const res = await api("/v1/operator/jobs/fee-collector", { method: "POST", headers: operator() });
  expect(res.status, await res.clone().text()).toBe(200);
}

/** The chain's clock, which is what puts a Ledger entry under a version; it need not agree with the wall clock. */
async function chainTime() {
  const time = await connection().getBlockTime(await connection().getSlot("confirmed"));
  return new Date((time ?? Math.floor(Date.now() / 1000)) * 1000);
}

/** A time far enough ahead to be announced, by the wall clock and by the chain's. */
async function announceable() {
  return new Date(Math.max(Date.now(), (await chainTime()).getTime()) + lead() + 2_000);
}

/** Waits until a version has taken effect for the API and every entry the chain now writes falls under it. */
async function inForce(effectiveAt: Date) {
  for (;;) {
    if (Date.now() > effectiveAt.getTime() + 1_000 && (await chainTime()).getTime() > effectiveAt.getTime() + 1_000) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Revenue on the Ledger: curve trades on a new coin, indexed, then claimed by the Fee Collector. */
async function collectRevenue() {
  const coin = await launchedCoin();
  const trader = await fundedWallet(5);
  await deliverWebhook([(await trade(trader, coin.mint, "buy", SOL(0.4))).signature]);
  await runCollector();
}

describe("the Budget Table", () => {
  it("publishes the version in force: six rows summing to 100%, the trader programs waiting at nothing", async () => {
    const table = await published();
    expect(table.inForce).toMatchObject({ version: 1, shares: FIRST });
    expect(table.upcoming).toEqual([]);
    expect(BUDGET_ROWS.reduce((sum, row) => sum + table.inForce.shares[row], 0)).toBe(10_000);
    const page = await budgets();
    expect(page.inForce).toBe(1);
    expect(page.versions).toEqual([table.inForce]);
    expect(page.rows.map((r) => r.row)).toEqual([...BUDGET_ROWS]);
    // The Burn's page reads its two shares from the same table.
    const burns = BurnsPage.parse(await (await api("/v1/burns")).json());
    expect(burns.shares).toMatchObject({ burnBps: FIRST.burn, flywheelBps: FIRST.flywheel });
    expect(burns.budgets.revenueLamports).toBe(page.netLamports);
  });

  it("divides the whole net: each row its share, the treasury what the others leave, and only spending rows hold anything back", async () => {
    await collectRevenue();
    const page = await budgets();
    const net = BigInt(page.netLamports);
    expect(net).toBeGreaterThan(0n);
    for (const row of SPENDING_ROWS) {
      const r = rowOf(page, row);
      expect(BigInt(r.allottedLamports)).toBe(share(net, FIRST[row]));
      expect(BigInt(r.availableLamports!)).toBe(BigInt(r.allottedLamports) - BigInt(r.spentLamports!));
    }
    const toRows = SPENDING_ROWS.reduce((sum, row) => sum + BigInt(rowOf(page, row).allottedLamports), 0n);
    expect(rowOf(page, "treasury")).toEqual({ row: "treasury", shareBps: FIRST.treasury, allottedLamports: (net - toRows).toString(), spentLamports: null, availableLamports: null });
    // Nothing is lost between the rows: together they are the net, to the lamport.
    expect(page.rows.reduce((sum, r) => sum + BigInt(r.allottedLamports), 0n)).toBe(net);
  });

  it("refuses a table that does not sum to 100%, one that gives the trader programs more than a fifth, and one without its lead time", async () => {
    const later = new Date(Date.now() + 3600_000);
    const short = await announce({ ...FIRST, treasury: 3400 }, later);
    expect(short.status).toBe(400);
    expect(JSON.stringify(await short.json())).toMatch(/sum to 10000/);
    const over = await announce({ ...FIRST, burn: 6100 }, later);
    expect(over.status).toBe(400);
    const greedy = await announce({ burn: 3900, flywheel: 500, rebates: 1000, referrals: 600, integrators: 500, treasury: 3500 }, later);
    expect(greedy.status).toBe(400);
    expect(JSON.stringify(await greedy.json())).toMatch(/trader programs/);
    expect((await announce({ ...FIRST, burn: -100, treasury: 3600 }, later)).status).toBe(400);
    const tooSoon = await announce(FIRST, new Date(Date.now() + lead() - 1_000));
    expect(tooSoon.status).toBe(422);
    expect((await api("/v1/operator/budget-table", { method: "POST", body: "{}" })).status).toBe(401);
    // Nothing was written by any of them.
    expect((await budgets()).versions).toHaveLength(1);
  });

  it("applies a new version only to what is collected after it takes effect, and a row keeps what it was allotted", async () => {
    await runCollector();
    const before = await budgets();
    const netBefore = BigInt(before.netLamports);
    expect(rowOf(before, "rebates").allottedLamports).toBe("0");

    // Volume rebates go live with 10%. (The owner's plan takes a program's share from the Burn; here it comes from the
    // treasury, so the other files' Burn and Flywheel figures stand whenever they run.)
    const withRebates: BudgetShares = { ...FIRST, rebates: 1000, treasury: 2500 };
    const from = await announceable();
    const announced = await announce(withRebates, from, "volume rebates go live");
    expect(announced.status).toBe(201);
    const second = BudgetTableVersion.parse(await announced.json());
    expect(second).toMatchObject({ version: 2, shares: withRebates, note: "volume rebates go live", effectiveAt: from.toISOString() });
    // Announced, not yet in force: the table everyone reads still divides the old way, and shows what is coming.
    expect(await published()).toMatchObject({ inForce: { version: 1 }, upcoming: [second] });
    expect((await budgets()).versions.map((v) => v.version)).toEqual([1, 2]);
    // The versions are one line in time: the next can't take effect before this one.
    const earlier = await announce(FIRST, new Date(from.getTime() - 500));
    expect(earlier.status).toBe(422);
    expect(JSON.stringify(await earlier.json())).toMatch(/must take effect after/);

    await inForce(from);
    expect(await published()).toMatchObject({ inForce: { version: 2, shares: withRebates }, upcoming: [] });
    // Taking effect moves nothing by itself: the rebates' row is owed no part of what was collected before it existed.
    const atStart = await budgets();
    expect(atStart.inForce).toBe(2);
    expect(atStart.netLamports).toBe(before.netLamports);
    expect(rowOf(atStart, "rebates")).toMatchObject({ shareBps: 1000, allottedLamports: "0", availableLamports: "0" });
    expect(rowOf(atStart, "treasury").allottedLamports).toBe(rowOf(before, "treasury").allottedLamports);

    await collectRevenue();
    const during = await budgets();
    const collected = BigInt(during.netLamports) - netBefore;
    expect(collected).toBeGreaterThan(0n);
    // A tenth of what was collected under the version, and nothing of what came before it.
    const rebates = share(collected, 1000);
    expect(rowOf(during, "rebates")).toMatchObject({ allottedLamports: rebates.toString(), spentLamports: "0", availableLamports: rebates.toString() });
    // A row whose share did not change has its share of the whole net, as before the table had versions.
    expect(BigInt(rowOf(during, "burn").allottedLamports)).toBe(share(BigInt(during.netLamports), FIRST.burn));
    expect(BigInt(rowOf(during, "flywheel").allottedLamports)).toBe(share(BigInt(during.netLamports), FIRST.flywheel));
    expect(during.rows.reduce((sum, r) => sum + BigInt(r.allottedLamports), 0n)).toBe(BigInt(during.netLamports));
    // The sweep that followed the collection left every spending row's unspent budget in the operations wallet.
    const reserved = SPENDING_ROWS.reduce((sum, row) => sum + BigInt(rowOf(during, row).availableLamports!), 0n);
    expect(BigInt(await connection().getBalance(new PublicKey(env().platform.operationsWallet), "confirmed"))).toBeGreaterThanOrEqual(reserved);

    // The share goes back to the treasury. What the row was allotted while it had a share stays its own.
    const back = await announceable();
    expect((await announce(FIRST, back, "volume rebates end")).status).toBe(201);
    await inForce(back);
    await collectRevenue();
    const after = await budgets();
    expect(after.inForce).toBe(3);
    expect(BigInt(after.netLamports)).toBeGreaterThan(BigInt(during.netLamports));
    expect(rowOf(after, "rebates")).toMatchObject({ shareBps: 0, allottedLamports: rebates.toString(), availableLamports: rebates.toString() });
    expect(BigInt(rowOf(after, "burn").allottedLamports)).toBe(share(BigInt(after.netLamports), FIRST.burn));
    expect(after.rows.reduce((sum, r) => sum + BigInt(r.allottedLamports), 0n)).toBe(BigInt(after.netLamports));
  }, 180_000);
});
