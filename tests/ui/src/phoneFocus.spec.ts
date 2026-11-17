// A phone-width window keeps two things over the page: the site header at its top and the tab bar at its foot, with a
// coin page's Buy / Sell bar on top of the tab bar. A control the browser brings into view by itself (a Tab press, a
// field it refused) must stop clear of all three, or the visitor cannot see or press it until they scroll by hand (#224).
import type { Page } from "@playwright/test";
import { expect, expectHydrated, fundedKeypair, launchViaApi, test } from "./fixtures";
import { connectWallet, signButton } from "./launchPage";
import { connectTestWallet } from "./wallet";

const PHONE = { width: 390, height: 844 };

/** Where the focused control stands in the window, against what the fixed bars leave of it. */
type Stop = {
  /** The control's accessible words, or its tag. */
  name: string;
  /** Inside a bar itself (the header, the tab bar, the Buy / Sell bar): such a control is never under one. */
  inBar: boolean;
  inMain: boolean;
  /** Seen on an earlier stop of the same walk. */
  seen: boolean;
  /** Pixels of the control, or of the row a radio or checkbox is drawn in, under the header (above zero is covered). */
  underHeader: number;
  /** The same under the bars at the window's foot. */
  underFoot: number;
};

/**
 * Reads the focused control once the page has settled on it. A radio or a checkbox inside its label is the whole row to
 * the eye, so the row is what must be clear; the browser itself scrolls the input alone.
 */
async function focusedStop(page: Page): Promise<Stop | null> {
  return page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.activeElement as HTMLElement | null;
    // Next's dev-mode indicator takes the focus too, and is not part of the product.
    if (!el || el === document.body || el === document.documentElement || el.localName === "nextjs-portal") return null;
    const w = window as unknown as { __stops?: WeakSet<Element> };
    const stops = (w.__stops ??= new WeakSet());
    const seen = stops.has(el);
    stops.add(el);
    const shown = (selector: string) => [...document.querySelectorAll(selector)].filter((b) => getComputedStyle(b).display !== "none");
    const header = shown("body > header");
    const foot = shown('nav[aria-label="Sections"], [data-trade-bar]');
    const bars = [...header, ...foot];
    const row = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox") ? el.closest("label") : null;
    const boxes = [el, row].filter((b): b is HTMLElement => !!b).map((b) => b.getBoundingClientRect());
    const top = Math.min(...boxes.map((b) => b.top));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    const words = el.getAttribute("aria-label") || row?.textContent || el.textContent || (el as HTMLInputElement).labels?.[0]?.textContent || el.getAttribute("name") || "";
    return {
      name: `${el.tagName.toLowerCase()} ${words.trim().replace(/\s+/g, " ").slice(0, 60)}`.trim(),
      inBar: bars.some((b) => b.contains(el)),
      inMain: !!el.closest("main"),
      seen,
      underHeader: Math.round((Math.max(0, ...header.map((b) => b.getBoundingClientRect().bottom)) - top) * 10) / 10,
      underFoot: Math.round((bottom - Math.min(window.innerHeight, ...foot.map((b) => b.getBoundingClientRect().top))) * 10) / 10,
    };
  });
}

/** The stops a bar covers, as lines a failure can be read from. */
const covered = (stops: Stop[]) =>
  stops
    .filter((s) => !s.inBar && (s.underHeader > 0 || s.underFoot > 0))
    .map((s) => (s.underFoot > 0 ? `${s.name}: ${s.underFoot}px under the foot's bars` : `${s.name}: ${s.underHeader}px under the header`));

/**
 * Tabs through the whole page, forwards or backwards, until the walk meets a control it has already stopped on, and
 * returns every stop. Forwards each control comes up from under the foot's bars, backwards from under the header.
 */
async function tabThrough(page: Page, key: "Tab" | "Shift+Tab"): Promise<Stop[]> {
  await page.evaluate(() => delete (window as unknown as { __stops?: unknown }).__stops);
  const stops: Stop[] = [];
  for (let presses = 0; presses < 600; presses++) {
    await page.keyboard.press(key);
    const stop = await focusedStop(page);
    // Between the page's last control and its first the focus may rest on the window itself.
    if (!stop) continue;
    if (stop.seen) return stops;
    stops.push(stop);
  }
  throw new Error(`the ${key} walk never came back round to a control it had met`);
}

/**
 * Every control of the page's main column, each focused on its own with the page first at its top and then at its end:
 * the unchecked radios of a group, which a Tab press passes over, and every control from the farthest it can come.
 */
async function focusEach(page: Page): Promise<Stop[]> {
  const count = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>("main :is(a[href], button, input, select, textarea, summary, [tabindex])")].filter((el) => {
      const r = el.getBoundingClientRect();
      return !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[data-trade-bar]");
    });
    (window as unknown as { __controls: HTMLElement[] }).__controls = controls;
    return controls.length;
  });
  const stops: Stop[] = [];
  for (const from of ["top", "end"] as const) {
    for (let i = 0; i < count; i++) {
      await page.evaluate(
        ([index, origin]) => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo({ top: origin === "top" ? 0 : document.documentElement.scrollHeight, behavior: "instant" });
          (window as unknown as { __controls: HTMLElement[] }).__controls[index as number]!.focus();
        },
        [i, from] as const,
      );
      const stop = await focusedStop(page);
      if (stop) stops.push({ ...stop, name: `${stop.name} (from the page's ${from})` });
    }
  }
  expect(stops.length, "every control took the focus").toBe(count * 2);
  return stops;
}

/**
 * How far the footer's end stands under the foot's bars once the page is scrolled to its end: above zero, its last
 * line can never be read (a coin page's kept its room inside the page, and the Buy / Sell bar covered the footer's
 * closing line for good, found with #224).
 */
const footerUnderFoot = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    const foot = [...document.querySelectorAll('nav[aria-label="Sections"], [data-trade-bar]')].filter((b) => getComputedStyle(b).display !== "none");
    const end = document.querySelector("body > footer")!.getBoundingClientRect().bottom;
    return Math.round((end - Math.min(window.innerHeight, ...foot.map((b) => b.getBoundingClientRect().top))) * 10) / 10;
  });

test.describe("on a phone-width window", () => {
  test.use({ viewport: PHONE });

  test("every control of the launch page stops clear of the header and the tab bar when the keyboard reaches it", async ({ page, wallet }) => {
    await page.goto("/launch");
    await expectHydrated(page);
    await connectWallet(page);
    // Everything the form can show at once: a ticker for the button, the four links behind "More links", a Reward
    // Launch's tax, burn and liquidity steps, and a Creator Lock's size, time and unlock.
    await page.getByLabel("Name").fill("Tab Bar Focus");
    await page.getByLabel("Ticker").fill("TABS");
    await page.getByRole("button", { name: /^More links/ }).click();
    await page.getByRole("radiogroup", { name: "Launch type" }).getByRole("radio", { name: "Reward Launch, paid in the coin" }).check();
    await page.getByRole("radiogroup", { name: "Creator Lock" }).getByRole("radio", { name: /^Lock coins for yourself/ }).check();
    await expect(signButton(page)).toHaveText(/^Stoke TABS/);

    const forwards = await tabThrough(page, "Tab");
    // The walk met the controls the tab bar stood over on the rehearsal (#224), and the rest of the form with them.
    const met = forwards.filter((s) => s.inMain).map((s) => s.name);
    for (const control of [/^button 25%/, /^button All at once/, /^input TikTok/, /^button Stoke TABS/]) expect(met.some((name) => control.test(name)), `${control} was tabbed to`).toBe(true);
    expect(met.length).toBeGreaterThan(40);
    expect(covered(forwards), "tabbing forwards").toEqual([]);
    expect(covered(await tabThrough(page, "Shift+Tab")), "tabbing backwards").toEqual([]);
    expect(covered(await focusEach(page)), "each control focused on its own").toEqual([]);
    expect(await footerUnderFoot(page), "the footer's end at the page's end").toBeLessThanOrEqual(0);
    // Nothing was asked of the wallet.
    expect(wallet.requests).toHaveLength(0);
  });

  test("every control of a coin's page stops clear of the header, the Buy / Sell bar and the tab bar when the keyboard reaches it", async ({ page, wallet }) => {
    const mint = await launchViaApi(await fundedKeypair(), { name: "Trade Focus", symbol: "FOCS" });
    await page.goto(`/coin/${mint}`);
    await expectHydrated(page);
    const panel = page.getByRole("region", { name: /^Trade( |$)/ });
    await connectTestWallet(page, panel.getByRole("button", { name: "Connect wallet" }));
    await expect(panel.getByRole("button", { name: "Review buy" })).toBeVisible();
    // With an amount in, the quote brings its link to the Fees page and the button can be pressed.
    await panel.getByLabel("You pay").fill("0.1");
    await expect(panel.getByText("You get about")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Review buy" })).toBeEnabled();
    await expect(page.locator("[data-trade-bar]")).toBeVisible();

    const forwards = await tabThrough(page, "Tab");
    const met = forwards.filter((s) => s.inMain).map((s) => s.name);
    for (const control of [/^button Buy$/, /^button Sell$/, /^input You pay/, /^button 0\.1 SOL/, /^a Every fee, explained/, /^button Review buy/]) {
      expect(met.some((name) => control.test(name)), `${control} was tabbed to`).toBe(true);
    }
    expect(covered(forwards), "tabbing forwards").toEqual([]);
    expect(covered(await tabThrough(page, "Shift+Tab")), "tabbing backwards").toEqual([]);
    expect(covered(await focusEach(page)), "each control focused on its own").toEqual([]);
    expect(await footerUnderFoot(page), "the footer's end at the page's end").toBeLessThanOrEqual(0);
    // Nothing was asked of the wallet.
    expect(wallet.requests).toHaveLength(0);
  });
});
