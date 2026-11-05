# Sign in: social and email sign-ins through an embedded-wallet provider, beside the wallets

Status: accepted by the owner on 2026-11-02 (#159, asked on 2026-10-31 on #133 and again on the launch flow's review page, #136), built in `apps/web` on Privy; amended on 2026-11-05, when the owner ruled that the site must stay free to run ("I cannot pay"): the provider is Web3Auth (MetaMask Embedded Wallets), and Privy's build was swapped for it the same day.

The owner wants "Sign in" where the site said "Connect wallet": Google, Apple, GitHub, X and email beside every Solana wallet, as the launchpads people come from offer it.
A wallet cannot do that by itself, and an identity service (Clerk, Auth0) gives a session but nothing that can sign a launch or a trade: a Google user would sign in and still have no wallet.
Social sign-in on a Solana site means an embedded-wallet provider, which authenticates the person and makes a Solana wallet for them that signs on their behalf.

## Decision

- **Web3Auth (MetaMask Embedded Wallets) is the sign-in provider** (since 2026-11-05; Privy from 2026-11-02 to then).
  Its SDK (`@web3auth/modal`, MIT) runs on React 19 and Next.js; its Base plan is free to 1,000 monthly active wallets and then 5 cents per extra wallet, with no monthly fee at any size, where Privy's free tier ended at 500 users with a $299-a-month cliff.
  It signs people in with Google, Apple, GitHub, X and an email code through `connectTo` without its own modal, so the sheet is the site's own design (every verdict of #130 stands), and it makes a Solana wallet (an ed25519 key held as shares across its network, released by the sign-in) for each sign-in.
  The email code is entered on Web3Auth's own page, which opens from the sheet.
- **The embedded wallet is a Wallet Standard wallet to the app.**
  Web3Auth exposes it in the standard's shape (`connection.solanaWallet`), and the site registers it with the window under its own name and icon as the **Stoker wallet** (`EMBEDDED_WALLET_NAME`), so the wallet adapter lists it, selects it and signs with it like Phantom.
  The trade panel, the launch form, the creator page and every signing path stay what they are: the server builds, the wallet signs (ADR 0003).
  Swapping Privy for Web3Auth touched one bridge file and the provider's name in the words, which is what the bridge was for.
- **Wallet users never touch the provider.**
  A Phantom, Solflare or Backpack user connects through the wallet adapter as before, with no sign-in-with-Solana and no provider account, so they pay no extra signature and count toward no monthly active wallet.
- **One control, one sheet.**
  "Sign in" stands everywhere "Connect wallet" stood (the header, the launch summary's action slot, the trade panel, the creator page, the phone's account sheet) and opens `SignInSheet`: Google, Apple, GitHub and X, email with its code, then the Solana wallets in the browser.
  Without a client id at build (`NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`) the sheet offers the wallets alone and the custody note shrinks to the one sentence that is always true.
- **The site's review is the confirmation.**
  The provider shows no confirmation of its own for a signature: a launch is confirmed by the launch summary's review and a trade by the trade review, both of which name the exact amounts before the action, and the signing panel then says "Signing with your Stoker wallet" rather than "Confirm in your wallet".
  The export of the wallet's key is the site's own dialog, showing the secret key once as Phantom and Solflare import it.
- **Custody, in the site's words.**
  A Stoker wallet's key exists only as shares, held across Web3Auth's network and released by the sign-in, recombined in the browser to sign; the user can export it at any time; and account access is wallet access, so whoever controls the Google, Apple, GitHub, X or email account controls the wallet.
  The sheet's note, the terms, the privacy notice and the risk disclosure say so; "Stoker never holds your funds or your keys" stays true for both kinds of wallet.
- **Funding by address first.**
  A new Stoker wallet is empty, so the account menu shows its full address with a copy button and its SOL balance, and says to send SOL from an exchange or another wallet.
  An on-ramp (cards, bank transfer) is a later unit; Web3Auth's own is a paid Wallet Services feature, so it would be a separate provider.
- **The account menu names the sign-in** (the name, handle or email it gave, with X's picture when there is one) above the wallet, offers Export key for a Stoker wallet, and ends with Sign out, which disconnects the wallet and ends the provider's session so nothing reconnects.
  A chosen display name and picture shown on a Creator's coins is a feature of its own (an API table, moderation, the coin page) and is filed separately.
- **The provider's tree is a leaf beside the app, never around it.**
  `SignInProvider` holds the state the app reads (`useSignIn`); the provider's tree renders under it as a client-only bridge that publishes its hooks' state upward, loaded only when a client id is set.
  The server render and a build without a client id carry none of the provider's code, and the Workers runtime never sees it.
- **The UI suite stands the provider in.**
  `tests/ui/src/wallet.ts` installs `window.__stokerSignIn` before any app code, as it installs the test wallet: its social and email sign-ins answer like the provider's, a sign-in registers a Stoker wallet that signs with the test key, and the whole signed-in flow (the sheet, the menu, a launch, sign out) is proven without the provider.
  The real sign-in is proven by hand on the dev site and the rehearsal, with the owner's client id.

## Considered Options

- **Clerk, Auth0 or any identity service alone**: a session with no key to sign with; every buy would still need a wallet, which is the thing the owner wants people to be able to do without.
- **Privy** (built first, 2026-11-02): Apache-2.0 SDK, the most precedent among Solana launchpads, the broadest socials; free to 500 monthly active users, then $299 a month, which the owner ruled out on 2026-11-05.
- **Dynamic**: the same shape (MIT SDK, socials, embedded Solana wallets), now part of Fireblocks; its sandbox is free but live mode is a paid plan from $249 a month, so a site with a handful of users pays before it earns.
- **Coinbase CDP Embedded Wallets**: free for 5,000 wallet operations a month and half a cent each beyond, with a Solana Wallet Standard package; Google and email only today (Apple "coming", no GitHub or X), and Coinbase's name on the wallet.
- **Reown AppKit**: free to 500 embedded-wallet users, then cut off unless on the $89-a-month plan: Privy's cliff at a lower price.
- **Phantom Connect**: Google and Apple, free, Solana-native, but its portal takes no new apps at the time of writing.
- **Self-built** (Google OAuth and a browser key backed up encrypted to the user's own Google Drive app folder): free forever and no third party, at the price of a week's careful work, Google's consent-screen review, recovery only as good as the user's Google account, and Apple, GitHub and X as identity alone.
- **The provider's own login modal**: one import, but a foreign UI in the one place the research says must read as the site's; `connectTo` costs a sheet and keeps the design whole.
- **The provider for wallet users too (sign in with Solana)**: one account model, at the price of an extra signature at every connection and a monthly active wallet per wallet user, for a profile the site does not yet have.

## Consequences

- A third party sits in the sign-in path: its dashboard holds the project, its allowlisted origins and the default social connections (runbook, section 14), its status affects sign-ins, and its pricing meter is monthly active wallets (free to 1,000, then 5 cents each).
- Builds with a client id grow by the provider's chunk, loaded on the client after hydration; the UI suite's stack sets no client id, so its measurements are of the site without it.
- Two kinds of wallet now sign: the legal pages describe both, and the signing panel names which one is at work.
- WalletConnect, Torus and a Ledger plugged in directly are not in the sheet: the sheet lists the wallets the browser has, a Ledger reaches the site through Phantom or Solflare, and WalletConnect needs a Reown project of the owner's; each is a follow-up when asked for.
