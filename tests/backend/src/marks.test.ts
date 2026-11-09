// Marks on a coin's chart (#160): the key wallets' trades grouped by candle, wallet and side, with the market cap at the
// last of them; every trade on request; the notable wallets the operator names after an X account; and the mentions job,
// which searches the stand-in for twitterapi.io (never the real one) for the coins that traded lately, stores each post
// once with its author's picture copied, tries a 429 again, and leaves the Ledger alone. Black box: the public API, the
// operator API and the stand-in.
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { avatarHues, MarkList, MARKS_PER_CANDLE, NotableWallet, NotableWalletList, type JobRun } from "@launchpad/contract";
import { freePort, startApi } from "@launchpad/stack";
import { coinsOf, connection, deliverWebhook, env, fundedWallet, getLaunch, launch, SOL, trade, trades } from "./client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });

async function marks(mint: string, query: Record<string, string>) {
  const res = await fetch(`${env().apiUrl}/v1/launches/${mint}/marks?${new URLSearchParams(query)}`);
  expect(res.status).toBe(200);
  return MarkList.parse(await res.json());
}

async function runMentions(apiUrl = env().apiUrl) {
  const res = await fetch(`${apiUrl}/v1/operator/jobs/mentions`, { method: "POST", headers: operator() });
  return { status: res.status, run: (await res.json()) as JobRun & { summary: { searched: number; found: number; rateLimited: number; failed: unknown[]; reason?: string } } };
}

async function standIn(path: string, body?: unknown) {
  const res = await fetch(`${env().x.url}${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.ok).toBe(true);
  return res.json() as Promise<{ requests: { query: string; status: number }[] }>;
}

const searchesNaming = async (mint: string) => (await standIn("/stand-in/requests")).requests.filter((r) => r.query.includes(mint));

/** The newest Ledger entry, which a run that records nothing leaves as it was. */
const newestLedgerEntry = async () => JSON.stringify(((await (await fetch(`${env().apiUrl}/v1/ledger?limit=1`)).json()) as { entries: unknown[] }).entries[0] ?? null);

const BUCKET_1M = 60;
const bucketOf = (iso: string, width: number) => Math.floor(Date.parse(iso) / 1000 / width) * width;

describe("Marks on a coin's chart", () => {
  it("marks the key wallets' trades by candle, wallet and side, every trade on request, and a notable wallet by its X account", async () => {
    const creator = await fundedWallet(10);
    const { prepared, signature } = await launch(creator, { firstBuy: SOL(0.1).toString() });
    await deliverWebhook([signature]);
    const mint = prepared.mint;

    // Two snipers inside the window, one of them twice (a group of two trades, unless a minute turns between them).
    const [a, b] = await Promise.all([fundedWallet(), fundedWallet()]);
    const early = [await trade(a, mint, "buy", SOL(0.1)), await trade(b, mint, "buy", SOL(0.05)), await trade(a, mint, "buy", SOL(0.02))];
    await deliverWebhook(early.map((t) => t.signature));

    // After the Snipe Window (40 slots, about 16 seconds): a wallet that buys and sells everything (no role at all), and a
    // notable wallet that does the same, named by the operator with a picture the API copies.
    await sleep(20_000);
    const [f, g] = await Promise.all([fundedWallet(), fundedWallet()]);
    const notablePicture = `${env().x.url}/pictures/notable_g.png`;
    const added = await fetch(`${env().apiUrl}/v1/operator/notable-wallets`, {
      method: "POST", headers: operator(), body: JSON.stringify({ wallet: g.publicKey.toBase58(), handle: "@notable_g", name: "Notable G", avatarUrl: notablePicture }),
    });
    expect(added.status).toBe(200);
    const notable = NotableWallet.parse(await added.json());
    expect(notable.x.handle).toBe("notable_g");
    expect(notable.x.avatarUrl).not.toBeNull();
    for (const w of [f, g]) {
      await deliverWebhook([(await trade(w, mint, "buy", SOL(0.03))).signature]);
      await deliverWebhook([(await trade(w, mint, "sell", await coinsOf(mint, w))).signature]);
    }

    const all = await trades(mint);
    const supply = (await connection().getTokenSupply(new PublicKey(mint), "confirmed")).value;
    const wholeSupply = Number(supply.amount) / 10 ** supply.decimals;
    const now = Math.ceil(Date.now() / 1000);

    // Every trade: one mark per candle, wallet and side, adding up that group's trades, its market cap the last one's.
    const every = await marks(mint, { interval: "1m", from: "0", to: String(now), trades: "all", mentions: "false" });
    const groups = new Map<string, typeof all>();
    for (const t of all) {
      const key = `${bucketOf(t.time, BUCKET_1M)}|${t.trader}|${t.side}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    expect(every.trades.length).toBe(groups.size);
    for (const m of every.trades) {
      const group = groups.get(`${m.time}|${m.wallet}|${m.side}`)!;
      expect(group, `${m.wallet} ${m.side} at ${m.time}`).toBeDefined();
      expect(m.trades).toBe(group.length);
      expect(BigInt(m.baseAmount)).toBe(group.reduce((s, t) => s + BigInt(t.baseAmount), 0n));
      expect(BigInt(m.quoteAmount)).toBe(group.reduce((s, t) => s + BigInt(t.quoteAmount), 0n));
      // The trades list comes newest first, so the group's last trade is its first entry.
      expect(m.signature).toBe(group[0]!.signature);
      expect(m.marketCap).toBeCloseTo(group[0]!.price * wholeSupply, 6);
    }
    expect(every.mentions).toEqual([]);

    // By default, the key wallets alone, each with why: the Creator, the snipers, the holders, the notable wallet.
    const key = await marks(mint, { interval: "1m", from: "0", to: String(now) });
    const roles = new Map<string, Set<string>>();
    for (const m of key.trades) roles.set(m.wallet, new Set([...(roles.get(m.wallet) ?? []), ...m.roles]));
    const [ka, kb, kc, kf, kg] = [a, b, creator, f, g].map((k) => k.publicKey.toBase58()) as [string, string, string, string, string];
    expect(roles.get(kc)).toEqual(new Set(["creator", "holder"]));
    expect(roles.get(ka)).toEqual(new Set(["sniper", "holder"]));
    expect(roles.get(kb)).toEqual(new Set(["sniper", "holder"]));
    expect(roles.get(kg)).toEqual(new Set(["notable"]));
    expect(roles.has(kf)).toBe(false);
    for (const m of key.trades) expect(m.roles.length).toBeGreaterThan(0);
    // The notable wallet carries its X account and its copied picture; every other wallet its generated avatar.
    const gMark = key.trades.find((m) => m.wallet === kg)!;
    expect(gMark.x).toEqual(notable.x);
    expect(gMark.avatarUrl).toBe(notable.x.avatarUrl);
    const copied = await fetch(gMark.avatarUrl);
    expect(copied.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await copied.arrayBuffer()).equals(Buffer.from(await (await fetch(notablePicture)).arrayBuffer()))).toBe(true);
    const aMark = key.trades.find((m) => m.wallet === ka)!;
    expect(aMark.x).toBeNull();
    const avatar = await fetch(aMark.avatarUrl);
    expect(avatar.headers.get("content-type")).toBe("image/svg+xml");
    const [h1, h2] = avatarHues(ka);
    expect(await avatar.text()).toContain(`hsl(${h1} 70% 56%)"/><stop offset="1" stop-color="hsl(${h2} 72% 38%)`);

    // The visitor's own wallet is a key wallet too.
    const mine = await marks(mint, { interval: "1m", from: "0", to: String(now), wallet: kf });
    expect(mine.trades.filter((m) => m.wallet === kf).map((m) => [m.side, m.roles])).toEqual([["buy", ["you"]], ["sell", ["you"]]]);

    // A range before the first trade has none; no trades at all on request.
    const first = Math.min(...all.map((t) => bucketOf(t.time, BUCKET_1M)));
    expect((await marks(mint, { interval: "1m", from: "0", to: String(first - BUCKET_1M) })).trades).toEqual([]);
    expect((await marks(mint, { interval: "1m", from: "0", to: String(now), trades: "none" })).trades).toEqual([]);

    // On one day's candle every group shares a bar; a bar carries at most ten, the key wallets kept before the rest.
    const days = new Set(all.map((t) => bucketOf(t.time, 86_400)));
    if (days.size === 1) {
      // Five more holders make twelve groups: the two without a role (f's) are the ones left off.
      for (const extra of await Promise.all(Array.from({ length: 5 }, () => fundedWallet())))
        await deliverWebhook([(await trade(extra, mint, "buy", SOL(0.01))).signature]);
      const day = await marks(mint, { interval: "1d", from: "0", to: String(now + 86_400), trades: "all" });
      expect(day.trades.length).toBe(MARKS_PER_CANDLE);
      const kept = new Set(day.trades.map((m) => m.wallet));
      for (const w of [kc, ka, kb, kg]) expect(kept.has(w)).toBe(true);
      expect(kept.has(kf)).toBe(false);
    }

    // The operator's list, and a removal, which takes the name and the picture off the marks.
    const listed = NotableWalletList.parse(await (await fetch(`${env().apiUrl}/v1/operator/notable-wallets`, { headers: operator() })).json());
    expect(listed.wallets.find((w) => w.wallet === kg)?.x.handle).toBe("notable_g");
    expect((await fetch(`${env().apiUrl}/v1/operator/notable-wallets/${kg}`, { method: "DELETE", headers: operator() })).status).toBe(200);
    expect((await fetch(gMark.avatarUrl)).status).toBe(404);
    const after = await marks(mint, { interval: "1m", from: "0", to: String(now), trades: "all" });
    expect(after.trades.filter((m) => m.wallet === kg).every((m) => m.x === null && m.roles.length === 0)).toBe(true);
  });

  it("refuses a bad request, an unknown coin and an operator call without the token", async () => {
    const { prepared, signature } = await launch(await fundedWallet());
    await deliverWebhook([signature]);
    const bad = await fetch(`${env().apiUrl}/v1/launches/${prepared.mint}/marks?interval=2m&from=0&to=1`);
    expect(bad.status).toBe(400);
    expect((await fetch(`${env().apiUrl}/v1/launches/${prepared.mint}/marks?from=10&to=1`)).status).toBe(400);
    expect((await fetch(`${env().apiUrl}/v1/launches/${prepared.pool}/marks?from=0&to=1`)).status).toBe(404);
    expect((await fetch(`${env().apiUrl}/v1/operator/notable-wallets`)).status).toBe(401);
    const badHandle = await fetch(`${env().apiUrl}/v1/operator/notable-wallets`, {
      method: "POST", headers: operator(), body: JSON.stringify({ wallet: prepared.mint, handle: "not a handle!" }),
    });
    expect(badHandle.status).toBe(400);
    const notAPicture = await fetch(`${env().apiUrl}/v1/operator/notable-wallets`, {
      method: "POST", headers: operator(), body: JSON.stringify({ wallet: prepared.mint, handle: "someone", avatarUrl: `${env().x.url}/stand-in/requests` }),
    });
    expect(notAPicture.status).toBe(400);
  });
});

describe("The mentions job", () => {
  it("searches the coins that traded lately, stores each post once with its author's picture, tries a 429 again and leaves the Ledger alone", async () => {
    const creator = await fundedWallet(10);
    const { prepared, signature } = await launch(creator, { firstBuy: SOL(0.1).toString() });
    await deliverWebhook([signature]);
    const mint = prepared.mint;
    const { launch: coin } = await getLaunch(mint);
    const symbol = coin!.symbol;
    // A coin that never traded is never searched, so the job's cost follows activity.
    const quiet = await launch(await fundedWallet());
    await deliverWebhook([quiet.signature]);

    const host = new URL(env().apiVars.WEB_ORIGIN!).host;
    const author = (n: number) => ({ id: String(1000 + n), userName: `poster_${n}_${symbol.toLowerCase()}`.slice(0, 15), name: `Poster ${n}` });
    const id = () => String(BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)));
    const posts = [
      { id: id(), text: `Just found ${mint} on Stoker`, author: author(1) },
      { id: id(), text: `$${symbol} is cooking`, author: author(2) },
      { id: id(), text: "Look at this coin", urls: [`https://${host}/coin/${mint}`], author: author(3) },
      // Another coin's post, and one posted long before this coin existed: neither is this coin's.
      { id: id(), text: `Just found ${quiet.prepared.mint}`, author: author(4) },
      { id: id(), text: `Early ${mint}`, createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(), author: author(5) },
    ];
    await standIn("/stand-in/posts", { posts });

    const ledgerBefore = await newestLedgerEntry();
    // The first search meets a 429 and is tried again.
    await standIn("/stand-in/rate-limit", { count: 1 });
    const first = await runMentions();
    expect(first.status).toBe(200);
    expect(first.run.status).toBe("succeeded");
    expect(first.run.summary.rateLimited).toBe(0);
    const searched = await searchesNaming(mint);
    expect(searched.map((r) => r.status)).toEqual([429, 200]);
    expect(searched[0]!.query).toContain(`$${symbol}`);
    expect(searched[0]!.query).toContain(`url:"${host}/coin/${mint}"`);
    expect(searched[0]!.query).toMatch(/since_time:\d+/);
    expect(await searchesNaming(quiet.prepared.mint)).toEqual([]);

    const now = Math.ceil(Date.now() / 1000);
    const found = await marks(mint, { interval: "1m", from: "0", to: String(now), trades: "none" });
    expect(found.mentions.map((m) => m.id).sort()).toEqual(posts.slice(0, 3).map((p) => p.id).sort());
    const supply = (await connection().getTokenSupply(new PublicKey(mint), "confirmed")).value;
    const { price } = (await trades(mint))[0]!;
    for (const m of found.mentions) {
      const post = posts.find((p) => p.id === m.id)!;
      expect(m.author.handle).toBe(post.author.userName);
      expect(m.author.name).toBe(post.author.name);
      expect(m.url).toBe(`https://x.com/${post.author.userName}/status/${post.id}`);
      expect(m.text).toBe(post.text);
      // Posted after the coin's only trade: the market cap it stood at then.
      expect(m.marketCap).toBeCloseTo((price * Number(supply.amount)) / 10 ** supply.decimals, 6);
      // The post sits on the coin's one candle, and the author's picture is ours, a copy of the stand-in's.
      expect(m.time).toBe(found.mentions[0]!.time);
      const picture = await fetch(m.author.avatarUrl!);
      expect(picture.headers.get("content-type")).toBe("image/png");
      const original = await fetch(`${env().x.url}/pictures/${post.author.userName}.png`);
      expect(Buffer.from(await picture.arrayBuffer()).equals(Buffer.from(await original.arrayBuffer()))).toBe(true);
    }

    // A second run finds the same posts and stores none again; it searches only since the last search.
    const second = await runMentions();
    expect(second.run.status).toBe("succeeded");
    expect((await marks(mint, { interval: "1m", from: "0", to: String(now), trades: "none" })).mentions).toHaveLength(3);
    const [, , again] = await searchesNaming(mint);
    expect(Number(/since_time:(\d+)/.exec(again!.query)![1])).toBeGreaterThan(Number(/since_time:(\d+)/.exec(searched[0]!.query)![1]));

    // A 429 that persists ends the run early without failing it: the coins it did not reach are searched next time.
    await standIn("/stand-in/rate-limit", { count: 1000 });
    try {
      const limited = await runMentions();
      expect(limited.run.status).toBe("succeeded");
      expect(limited.run.summary.rateLimited).toBeGreaterThan(0);
      expect(limited.run.summary.searched).toBe(0);
    } finally {
      await standIn("/stand-in/rate-limit", { count: 0 });
    }

    // Nothing the job did reached the Ledger.
    expect(await newestLedgerEntry()).toBe(ledgerBefore);
  });

  it("calls nothing without TWITTERAPI_API_KEY, on the cron or by hand", async () => {
    const h = env();
    const vars = { ...h.apiVars };
    delete vars.TWITTERAPI_API_KEY;
    const other = await startApi({ port: await freePort(), databaseUrl: h.databaseUrl, vars });
    try {
      const before = (await standIn("/stand-in/requests")).requests.length;
      const byHand = await runMentions(other.url);
      expect(byHand.run.status).toBe("succeeded");
      expect(byHand.run.summary.searched).toBe(0);
      expect(byHand.run.summary.reason).toMatch(/TWITTERAPI_API_KEY/);
      expect((await fetch(`${other.url}/__scheduled?cron=${encodeURIComponent("*/10 * * * *")}`)).ok).toBe(true);
      expect((await standIn("/stand-in/requests")).requests.length).toBe(before);
    } finally {
      await other.stop();
    }
  });
});
