// What every UI test gets: the running stack, the web app as base URL, a funded wallet installed in the page, and a
// guard that fails the test on any browser error, since a console error is a bug a user would hit.
import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { LaunchList, PreparedLaunch, PreparedTrade, type TradeSide } from "@launchpad/contract";
import type { StackEnv } from "@launchpad/stack";
import { installTestWallet, type TestWallet } from "./wallet";

export { expect };

export const COIN_PNG = readFileSync(new URL("../fixtures/coin.png", import.meta.url));

export function stackEnv(): StackEnv {
  const raw = process.env.LAUNCHPAD_STACK;
  if (!raw) throw new Error("LAUNCHPAD_STACK is not set: run the suite through `pnpm test:ui` so the global setup starts the stack");
  return JSON.parse(raw) as StackEnv;
}

const connection = () => new Connection(stackEnv().rpcUrl, "confirmed");

export async function fundedKeypair(sol = 5) {
  const kp = Keypair.generate();
  const conn = connection();
  const signature = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction({ signature, ...(await conn.getLatestBlockhash("confirmed")) }, "confirmed");
  return kp;
}

export async function listLaunches() {
  return LaunchList.parse(await (await fetch(`${stackEnv().apiUrl}/v1/launches?limit=100`)).json()).launches;
}

export type LaunchFields = { name: string; symbol: string; description?: string; website?: string; x?: string; telegram?: string };

/** Launches a coin the way any API client would: prepare, sign, send, report. */
export async function launchViaApi(creator: Keypair, fields: LaunchFields) {
  const { apiUrl } = stackEnv();
  const form = new FormData();
  form.set("creator", creator.publicKey.toBase58());
  for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
  form.set("image", new Blob([COIN_PNG], { type: "image/png" }), "coin.png");
  const res = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`prepare failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedLaunch.parse(await res.json());
  const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
  tx.sign([creator]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx);
  await conn.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    "confirmed",
  );
  await fetch(`${apiUrl}/v1/transactions/${signature}`, { method: "POST" });
  return prepared.mint;
}

/** Trades on a Launch the way any API client would: prepare, sign, send, report. `amount` is raw units of what is paid. */
export async function tradeViaApi(trader: Keypair, mint: string, side: TradeSide, amount: bigint, slippageBps = 100) {
  const { apiUrl } = stackEnv();
  const res = await fetch(`${apiUrl}/v1/trades/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mint, trader: trader.publicKey.toBase58(), side, amount: amount.toString(), slippageBps }),
  });
  if (!res.ok) throw new Error(`prepare trade failed: ${res.status} ${await res.text()}`);
  const prepared = PreparedTrade.parse(await res.json());
  const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
  tx.sign([trader]);
  const conn = connection();
  const signature = await conn.sendTransaction(tx);
  const result = await conn.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) throw new Error(`trade failed: ${JSON.stringify(result.value.err)}`);
  await fetch(`${apiUrl}/v1/transactions/${signature}`, { method: "POST" });
  return prepared.quote;
}

/** Nothing on the page may be wider than the viewport: a sideways scroll on a phone is a layout bug. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > width + 0.5 || r.left < -0.5) && !el.closest(".visually-hidden, dialog:not([open])");
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
    return { scroll: document.documentElement.scrollWidth - width, offenders };
  });
  expect(overflow, "page content wider than the viewport").toEqual({ scroll: 0, offenders: [] });
}

/** Text the page cuts short with an ellipsis: every name and ticker the contract allows must show in full. */
export async function expectNoTruncatedText(page: Page) {
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => !el.closest(".visually-hidden"))
      .filter((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.textContent} (${el.scrollWidth}px in ${el.clientWidth}px)`),
  );
  expect(cut, "text cut off with an ellipsis").toEqual([]);
}

export const test = base.extend<{ stack: StackEnv; wallet: TestWallet; browserErrors: void }>({
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => use(stackEnv()),
  baseURL: async ({ stack }, use) => use(stack.webUrl ?? undefined),
  wallet: async ({ page }, use) => use(await installTestWallet(page, await fundedKeypair())),
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        // A page's own HTTP status (a 404 for a coin that doesn't exist) is asserted by the test, not treated as an error.
        const ownStatus = m.text().startsWith("Failed to load resource") && m.location().url === page.url();
        if (m.type() === "error" && !ownStatus) errors.push(`console: ${m.text()}`);
      });
      await use();
      expect(errors, "the browser reported errors").toEqual([]);
    },
    { auto: true },
  ],
});
