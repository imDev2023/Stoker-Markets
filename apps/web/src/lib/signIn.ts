/**
 * Sign in (owner, 2026-10-31 and 2026-11-02, #159, ADR 0016; the provider swapped on 2026-11-05): one "Sign in" control
 * opens one sheet that offers Google, Apple, GitHub, X and email beside every Solana wallet in the browser. A social
 * or email sign-in gets a Solana wallet of its own, the Stoker wallet, made and held with Web3Auth (MetaMask Embedded
 * Wallets), the sign-in provider: its key is held as shares across Web3Auth's network and released by the sign-in,
 * and the user can export it. The wallet reaches the app through the Wallet Standard like any other wallet, so the
 * trade panel and the launch form stay what they are (ADR 0003).
 *
 * The provider is used only when a client id is set at build, and never on the server: `SignInProvider` loads the
 * Web3Auth bridge on the client alone. The UI suite stands the provider in through `window[SIGN_IN_STAND_IN]`,
 * installed before any app code as the test wallet is, so the sheet and the whole signed-in flow are tested without
 * Web3Auth.
 */

/** The Web3Auth client id, set at build (`NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`); without it the sheet offers wallets alone. */
export const WEB3AUTH_CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";

/** Web3Auth's network: Sapphire Mainnet unless the build names the devnet one for a throwaway project. */
export const WEB3AUTH_NETWORK_NAME = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK === "sapphire_devnet" ? "sapphire_devnet" : "sapphire_mainnet";

/** The sign-in provider, named where the custody words need it. */
export const SIGN_IN_PROVIDER = "Web3Auth";

/** The embedded wallet's name, as the wallet adapter and the signing panel see it. */
export const EMBEDDED_WALLET_NAME = "Stoker wallet";

/** The window key of the suite's stand-in for the provider (tests/ui/src/wallet.ts). */
export const SIGN_IN_STAND_IN = "__stokerSignIn";

export type SocialProvider = "google" | "apple" | "github" | "twitter";

/** The social sign-ins, in the sheet's order. */
export const SOCIALS: ReadonlyArray<{ id: SocialProvider; label: string }> = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "github", label: "GitHub" },
  { id: "twitter", label: "X" },
];

/** How a signed-in user is shown: the provider, the name, handle or email it gave, and its picture when it has one. */
export type SignInAccount = {
  provider: SocialProvider | "email";
  label: string;
  picture: string | null;
};

/**
 * The embedded wallet's icon for the Wallet Standard (a data URL is what the standard asks for): the mark's ring on
 * its dark tile, the same drawing as /icon.svg.
 */
export const EMBEDDED_WALLET_ICON =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="h" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffb020"/></linearGradient></defs>' +
      '<rect width="32" height="32" rx="7" fill="#0c1116"/><circle cx="16" cy="16" r="8.6" fill="none" stroke="url(#h)" stroke-width="4.2"/></svg>',
  );
