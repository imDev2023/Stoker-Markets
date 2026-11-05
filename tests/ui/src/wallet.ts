// A Wallet Standard wallet for the browser under test. The page sees an ordinary installed Solana wallet; the key stays in
// Node and signs through an exposed function, so tests decide per request whether the "user" approves or declines.
import { expect, type Locator, type Page } from "@playwright/test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";

export const TEST_WALLET_NAME = "Test Wallet";
/** The embedded wallet a social or email sign-in gets (apps/web/src/lib/signIn.ts), registered by the stand-in on a sign-in. */
export const STOKER_WALLET_NAME = "Stoker wallet";
/** The secret key the stand-in's export shows (not the test wallet's real key, which stays in Node). */
export const STAND_IN_SECRET = "StandInSecretKey1111111111111111111111111111111111111111111111111111111111111111111111";
/** Who each social sign-in signs in as, in the stand-in: the label the account menu shows. */
export const SIGN_IN_ACCOUNTS = { google: "Ada Lovelace", apple: "ada@icloud.example", github: "adalovelace", twitter: "@adalovelace" } as const;
export type SocialProvider = keyof typeof SIGN_IN_ACCOUNTS;
const SOCIAL_LABELS: Record<SocialProvider, string> = { google: "Google", apple: "Apple", github: "GitHub", twitter: "X" };
/** The window key the app reads the stand-in from (apps/web/src/lib/signIn.ts, SIGN_IN_STAND_IN). */
const SIGN_IN_KEY = "__stokerSignIn";
const STOKER_ICON = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0c1116"/><circle cx="16" cy="16" r="8.6" fill="none" stroke="#ff8a1f" stroke-width="4.2"/></svg>`,
).toString("base64")}`;

const ICON = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2b45ff"/>` +
    `<path d="M9 12h14v10H9z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="19" cy="17" r="1.8" fill="#fff"/></svg>`,
).toString("base64")}`;

export type TestWallet = {
  keypair: Keypair;
  /** Every transaction the wallet was asked to sign, in order, as the page handed it over. */
  requests: VersionedTransaction[];
  /** The next signature request is declined, as a user pressing "Reject" in their wallet. */
  declineNext: () => void;
};

/** What the sign-in stand-in has seen, read from the page (`signInState`). */
export type SignInStandInState = {
  authenticated: boolean;
  account: { provider: string; label: string; picture: string | null } | null;
  embeddedAddress: string | null;
  emails: string[];
  exports: number;
  logouts: number;
};

type InitArgs = {
  name: string;
  icon: string;
  address: string;
  publicKey: number[];
  /** The sign-in provider's stand-in (ADR 0016), or none: then the sheet offers the wallets alone. */
  signIn: { key: string; walletName: string; icon: string; secret: string; accounts: Record<string, string> } | null;
};

/**
 * Runs in the page before any app code: registers the test wallet with whichever Wallet Standard app shows up, and
 * stands in for the sign-in provider: a social or email sign-in registers the Stoker wallet, which signs with the
 * same key through the same exposed function, so a signed-in flow is checked like a wallet's.
 */
function install({ name, icon, address, publicKey, signIn }: InitArgs) {
  const chains = ["solana:localnet", "solana:devnet"] as const;
  const account = Object.freeze({
    address,
    publicKey: new Uint8Array(publicKey),
    chains,
    features: ["solana:signTransaction"] as const,
    label: name,
  });
  let accounts: (typeof account)[] = [];
  const listeners = new Set<(p: { accounts: typeof accounts }) => void>();
  const changed = () => listeners.forEach((l) => l({ accounts }));
  const toB64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
  const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const sign = (window as unknown as { __testWalletSign: (tx: string) => Promise<string> }).__testWalletSign;

  const makeWallet = (walletName: string, walletIcon: string) => ({
    version: "1.0.0",
    name: walletName,
    icon: walletIcon,
    chains,
    get accounts() {
      return accounts;
    },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          accounts = [account];
          changed();
          return { accounts };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          accounts = [];
          changed();
        },
      },
      "standard:events": {
        version: "1.0.0",
        on: (event: string, listener: (p: { accounts: typeof accounts }) => void) => {
          if (event !== "change") return () => undefined;
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: (...inputs: { transaction: Uint8Array }[]) =>
          Promise.all(inputs.map(async ({ transaction }) => ({ signedTransaction: fromB64(await sign(toB64(transaction))) }))),
      },
    },
  });
  const registerWallet = (wallet: ReturnType<typeof makeWallet>) => {
    const give = (api: { register: (w: unknown) => unknown }) => api.register(wallet);
    window.addEventListener("wallet-standard:app-ready", (e) => give((e as CustomEvent).detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: give }));
  };
  registerWallet(makeWallet(name, icon));
  if (!signIn) return;

  type Account = { provider: string; label: string; picture: string | null };
  const watchers = new Set<() => void>();
  const state = { authenticated: false, account: null as Account | null, embeddedAddress: null as string | null, emails: [] as string[], exports: 0, logouts: 0 };
  const notify = () => watchers.forEach((w) => w());
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let registered = false;
  // The session outlives a page load, as the provider's does: kept in sessionStorage, restored on install.
  const signedIn = (account: Account) => {
    if (!registered) {
      registerWallet(makeWallet(signIn.walletName, signIn.icon));
      registered = true;
    }
    state.authenticated = true;
    state.account = account;
    state.embeddedAddress = address;
    window.sessionStorage.setItem(signIn.key, JSON.stringify(account));
    notify();
  };
  const saved = window.sessionStorage.getItem(signIn.key);
  if (saved) signedIn(JSON.parse(saved) as Account);
  (window as unknown as Record<string, unknown>)[signIn.key] = {
    ready: true,
    get authenticated() {
      return state.authenticated;
    },
    get account() {
      return state.account;
    },
    get embeddedAddress() {
      return state.embeddedAddress;
    },
    loginWith: async (provider: string) => {
      await delay(120);
      signedIn({ provider, label: signIn.accounts[provider] ?? provider, picture: null });
    },
    // The provider sends the code and takes it on its own page; here that page is a short delay.
    loginWithEmail: async (email: string) => {
      await delay(120);
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");
      state.emails.push(email);
      signedIn({ provider: "email", label: email, picture: null });
    },
    logout: async () => {
      state.authenticated = false;
      state.account = null;
      state.embeddedAddress = null;
      state.logouts += 1;
      window.sessionStorage.removeItem(signIn.key);
      notify();
    },
    exportWallet: async () => {
      state.exports += 1;
      return signIn.secret;
    },
    subscribe: (w: () => void) => {
      watchers.add(w);
      return () => void watchers.delete(w);
    },
    state,
  };
}

/** The sign-in sheet, open. */
export const signInSheet = (page: Page) => page.getByRole("dialog", { name: "Sign in" });

/** What the stand-in has seen so far. */
export const signInState = (page: Page) =>
  page.evaluate((key) => (window as unknown as Record<string, { state: SignInStandInState }>)[key]!.state, SIGN_IN_KEY);

/**
 * Opens the sign-in sheet from a "Sign in" button and returns it. A click that lands before the page has hydrated does
 * nothing (the button has no handler yet), and on a busy machine hydration can come well after the page looks ready,
 * so it clicks again until the sheet is open.
 */
export async function openSignIn(page: Page, button: Locator) {
  const sheet = signInSheet(page);
  await expect(async () => {
    if (!(await sheet.isVisible())) await button.click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

/** Connects the test wallet from a "Sign in" button: the sheet's wallet entry. */
export async function connectTestWallet(page: Page, button: Locator) {
  await (await openSignIn(page, button)).getByRole("button", { name: TEST_WALLET_NAME }).click();
  await expect(signInSheet(page)).toHaveCount(0);
}

/** Signs in with a social provider from a "Sign in" button, through the stand-in; the Stoker wallet then connects. */
export async function signInWith(page: Page, button: Locator, provider: SocialProvider) {
  await (await openSignIn(page, button)).getByRole("button", { name: `Continue with ${SOCIAL_LABELS[provider]}` }).click();
  await expect(signInSheet(page)).toHaveCount(0);
}

/**
 * Where the site's own account control lives: the header on a desktop; under 768px the header has no account, and
 * the tab bar's Account tab opens a sheet that holds it (the sheet is returned open).
 */
export async function accountArea(page: Page): Promise<Locator> {
  if ((page.viewportSize()?.width ?? 1440) >= 768) return page.getByRole("banner");
  const sheet = page.getByRole("dialog", { name: "Account" });
  // A tap before hydration does nothing, so the sheet is asked for until it opens.
  await expect(async () => {
    if (!(await sheet.isVisible())) await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Account" }).click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

/** Connects the test wallet from the site's own control and leaves the page as it was (a phone's sheet closed again). */
export async function connectFromSite(page: Page) {
  const area = await accountArea(page);
  await connectTestWallet(page, area.getByRole("button", { name: "Sign in" }));
  const sheet = page.getByRole("dialog", { name: "Account" });
  if (await sheet.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  }
}

/** Installs the wallet into a page, with the sign-in stand-in unless told not to; call before the first navigation. */
export async function installTestWallet(page: Page, keypair: Keypair, { socialSignIn = true }: { socialSignIn?: boolean } = {}): Promise<TestWallet> {
  let decline = false;
  const wallet: TestWallet = { keypair, requests: [], declineNext: () => void (decline = true) };
  await page.exposeFunction("__testWalletSign", (b64: string) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
    wallet.requests.push(tx);
    if (decline) {
      decline = false;
      throw new Error("User rejected the request.");
    }
    tx.sign([keypair]);
    return Buffer.from(tx.serialize()).toString("base64");
  });
  await page.addInitScript(install, {
    name: TEST_WALLET_NAME,
    icon: ICON,
    address: keypair.publicKey.toBase58(),
    publicKey: Array.from(keypair.publicKey.toBytes()),
    signIn: socialSignIn ? { key: SIGN_IN_KEY, walletName: STOKER_WALLET_NAME, icon: STOKER_ICON, secret: STAND_IN_SECRET, accounts: SIGN_IN_ACCOUNTS } : null,
  } satisfies InitArgs);
  return wallet;
}
