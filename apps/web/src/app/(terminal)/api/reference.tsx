import type { ReactNode } from "react";
import { SITE_LINKS } from "@/lib/site";
import styles from "./page.module.css";

/**
 * The public API's reference, the whole of it, as the page's content (owner, 2026-10-25: everything on the page,
 * nothing left in the repository to link out to). The zod contract in `packages/contract` is the source of truth for
 * every shape; this is the map. Keep it to what the API really answers: a row names an endpoint and says what it
 * answers or prepares, and the errors section lists only the statuses `apps/api/src` sends.
 */

export type Row = { endpoint: string | readonly string[]; text: ReactNode };
export type Section = { id: string; title: string; lead?: ReactNode; rows?: readonly Row[]; body?: ReactNode };

const C = ({ children }: { children: ReactNode }) => <code className={styles.code}>{children}</code>;

const SIGN_SEND_REPORT = `import { Connection, VersionedTransaction } from "@solana/web3.js";

const api = "https://api.stoker.markets/v1";
const prepared = await (await fetch(\`\${api}/trades/prepare\`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mint, trader: wallet.publicKey.toBase58(), side: "buy", amount: "100000000", slippageBps: 100 }),
})).json();

const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
tx.sign([wallet]);
const connection = new Connection(rpcUrl, "confirmed"); // your own RPC, or rpcUrl from GET /platform
const signature = await connection.sendTransaction(tx);
await connection.confirmTransaction({ signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed");
await fetch(\`\${api}/transactions/\${signature}\`, { method: "POST" });`;

export const SECTIONS: readonly Section[] = [
  {
    id: "reading",
    title: "Reading, no key needed",
    lead: <>Every read is open. Everything the site shows comes from these, in this order: the platform, the assets, the coins, what holders and Creators earn, and the platform&apos;s own books.</>,
    rows: [
      {
        endpoint: "GET /platform",
        text: (
          <>
            The cluster, an RPC for browsers, the program and PlatformConfig addresses, the Graduation Target in lamports, and every fee as the chain has it now: the Platform Fee and Creator Fee on the curve (<C>platformFeeBps</C>, <C>creatorFeeBps</C>, the latter 0 on this platform), the pool&apos;s creator fee (<C>poolCreatorFeeBps</C>) with the share of it Raydium keeps at collection (<C>poolCreatorFeeShareBps</C>), Raydium&apos;s own fee on each venue (<C>raydiumFee</C>), the share of the pool trade fee its liquidity providers keep (<C>raydiumFee.poolLpShareBps</C>, which reaches the platform through the Fee Key), the referral share rate, <C>creatorForward</C>: the Creator&apos;s share of what the platform collects on their coin&apos;s trades (<C>shareBps</C>), also as basis points of curve and pool volume, with its minimum; the Graduation Fee in lamports (<C>graduationFeeLamports</C>, ADR 0015), and the route&apos;s slippage limit for buys paid with SOL (<C>solRouteToleranceBps</C>). The site&apos;s Fees page is drawn from this answer.
          </>
        ),
      },
      {
        endpoint: ["GET /quotes", "GET /quotes/:mint"],
        text: (
          <>
            The Quote Registry: every Quote Asset with its <C>category</C> and, for a tokenized stock, its <C>issuer</C> (from the mint&apos;s address and authorities and the token list&apos;s tags, never a name), its price, Graduation Target, whether it can be launched against, whether a referral share fee applies on it, its <C>liquidityUsd</C> from the token list (null when the list doesn&apos;t know the mint; SOL comes first, then what can be launched against, the deepest markets first), and its Quote Risk Labels (<C>labels</C>: <C>kind</C>, <C>severity</C>, <C>title</C>, <C>detail</C>, <C>source</C>; null until the Quote Registry refresh has checked the mint, an empty list when there is nothing to flag). Labels come from the mint&apos;s authorities and Token-2022 extensions and from the token list; they inform and never block.
          </>
        ),
      },
      {
        endpoint: "GET /launches",
        text: (
          <>
            The board. <C>sort</C> (<C>new</C>, <C>trending</C>, <C>market_cap</C>, <C>graduation</C>), <C>q</C> (a search: a name or ticker containing it in any case, or a mint address starting with it; up to 64 characters), <C>quote</C>, <C>category</C> (<C>sol</C>, <C>stablecoin</C>, <C>tokenized_stock</C>, <C>rwa</C>, <C>wrapped</C>, <C>defi</C>, <C>leveraged</C>, <C>collectible</C>, <C>meme</C>, <C>community</C>), <C>issuer</C> (<C>xstocks</C>, <C>prestocks</C>, <C>tessera</C>, <C>backpack</C>: the stock issuer of the Quote Asset, finer than <C>category=tokenized_stock</C>), <C>status</C>, <C>limit</C>, <C>offset</C>.
          </>
        ),
      },
      { endpoint: "GET /launches/quotes", text: <>The Quote Assets that have Launches, for filters; each with its <C>category</C> and, for a tokenized stock, its <C>issuer</C>.</> },
      { endpoint: "GET /launches/:mint", text: <>One Launch: curve progress, Graduation (with its <C>fee</C>, the Graduation Fee and how much of it has been withheld), Reward Tax (with its <C>payout</C> asset, <C>coin</C> or <C>quote</C>), market, Copy Protection (<C>protection.until</C>, and <C>copyOf</C> when the coin took an earlier coin&apos;s name, ticker or image).</> },
      {
        endpoint: ["GET /launches/:mint/trades", "GET /launches/:mint/candles?interval=", "GET /launches/:mint/holders"],
        text: <>Indexed trades (with any referral fee paid), price candles, and the top holders read from the chain.</>,
      },
      {
        endpoint: "GET /launches/:mint/quote",
        text: (
          <>
            A trade quote. <C>side</C>, <C>amount</C>, <C>slippageBps</C>, <C>payWith</C> (<C>quote</C> or <C>sol</C>), <C>referrer</C>. A buy paid with SOL on a coin paired with another asset carries <C>route</C>: the swap takes exactly <C>solIn</C>, the trade spends <C>quoteOut</C> (the least the swap may deliver, <C>slippageBps.route</C> under the current price), and about <C>kept</C> of the Quote Asset stays in the trader&apos;s wallet.
          </>
        ),
      },
      { endpoint: "GET /launches/:mint/airdrop", text: <>An Airdrop&apos;s recipients and which are paid.</> },
      {
        endpoint: ["GET /launches/:mint/rewards", "GET /rewards/rules", "GET /rewards/rounds/:id", "GET /wallets/:address/rewards"],
        text: (
          <>
            Holder Rewards: the Payout Asset, tax waiting, the pot, the rules in force and announced, every round, a wallet&apos;s payouts; for a Quote Asset payout also the Reward Sales (<C>sales</C>: the bounds, totals, and the latest sales with their transactions). Amounts of a pot or payout are in the round&apos;s <C>payout</C> asset.
          </>
        ),
      },
      {
        endpoint: ["GET /creators/:address/earnings", "GET /creators/:address/forwards"],
        text: (
          <>
            Creator Earnings: per Quote Asset what the Creator&apos;s Launches earned (half of what the platform collected on their trades), what Graduation Fees kept of it (<C>withheld</C>), what was forwarded to their wallet and what is still pending; per Launch what its curve and pool earned and its <C>graduationFee</C> once it has graduated (the fee in lamports, what has been withheld toward it in the Quote Asset and its worth, and when it was settled); and every forward with its transaction. Nothing to claim.
          </>
        ),
      },
      { endpoint: "GET /creators/:address/launch-permissions", text: <>What the launch form offers this wallet: <C>airdrop</C> is true only for wallets the operator has allowed.</> },
      {
        endpoint: ["GET /revenue", "GET /ledger"],
        text: (
          <>
            Platform revenue per asset and per day, with what of it was forwarded to Creators and what is still owed them, and the Ledger page by page (<C>kind</C>, <C>limit</C>, <C>before</C>). A <C>creator_forward</C> entry is a payment to a Creator, an <C>arweave_top_up</C> SOL sent to ArDrive Turbo for upload credits, a <C>metadata_upload</C> what one Launch&apos;s permanent metadata cost in those credits, in lamports, against its launch transaction, a <C>reward_sale</C> a Reward Launch&apos;s tax sold for its holders: the coins out and the Quote Asset in, two entries of one transaction, and a <C>graduation_fee</C> a Graduation Fee (ADR 0015) withheld from a Creator&apos;s share in the coin&apos;s Quote Asset, keyed by the graduation transaction from event index 1000 up; nothing moves, so it is never added to a total, and each asset&apos;s <C>graduationFee</C> on <C>GET /revenue</C> is the sum of them.
          </>
        ),
      },
      { endpoint: "GET /burns", text: <>Burn and Flywheel: shares, rule, budgets, picks, every buy and burn.</> },
      { endpoint: "GET /announcements", text: <>Every announced Platform Fee or Creator Fee change, with the transaction that applied it once it has.</> },
      {
        endpoint: ["GET /metadata/:mint.json", "GET /metadata/:mint/image"],
        text: (
          <>
            A coin&apos;s metadata JSON and image as the platform&apos;s own cache serves them. The address on the chain is the Arweave one, where both are posted once the launch is indexed; this copy answers under the platform&apos;s domain meanwhile and after.
          </>
        ),
      },
      { endpoint: "GET /health", text: <>Outside <C>/v1</C>. Answers only when the deployment&apos;s configuration is valid, so a misconfigured deploy never looks ready.</> },
    ],
  },
  {
    id: "preparing",
    title: "Preparing transactions",
    lead: (
      <>
        Each returns an unsigned transaction (base64) for the user&apos;s wallet to sign and send, with its <C>lastValidBlockHeight</C>. Nothing is custodied: the API never holds a key of yours, and a transaction it prepares does only what its endpoint says.
      </>
    ),
    rows: [
      {
        endpoint: ["POST /launches/prepare (multipart)", "POST /launches/:mint/prepare"],
        text: (
          <>
            A launch: <C>creator</C>, <C>quoteMint</C>, <C>name</C>, <C>symbol</C>, <C>description</C>, <C>website</C>, <C>x</C>, <C>telegram</C>, <C>image</C>, and the launch modes <C>firstBuy</C>, <C>airdrop</C>, <C>rewardTax</C> and, with it, <C>rewardPayout</C> (<C>coin</C> or <C>quote</C>; <C>coin</C> unless set, refused with 400 without <C>rewardTax</C>). An <C>airdrop</C> from a wallet the operator has not allowed is refused with 403. The mint address and the coin&apos;s <C>metadataUri</C> on Arweave are fixed at first prepare; the second form rebuilds the same launch for a retry, so a retry never mints a second coin. The image and metadata JSON are uploaded to Arweave once the launch is indexed; until then the URI answers 404. A name, ticker or image that a coin launched inside its Copy Protection window already has is refused with 409 and the verdict (<C>copy</C>), as <C>POST /launches/check</C> would have said.
          </>
        ),
      },
      {
        endpoint: "POST /launches/check (multipart)",
        text: (
          <>
            Copy Protection before the form is sent: <C>name</C>, <C>symbol</C> and <C>image</C>, each optional, and <C>creator</C>, whose own coins never count. Answers a verdict per field sent (<C>free</C>, <C>taken</C> with the protected coin and the sentence prepare would refuse with, or <C>unchecked</C> for an image the API can&apos;t read) and <C>protectionSeconds</C>, the window every launch gets.
          </>
        ),
      },
      { endpoint: "GET /launch-quote", text: <>What a First Buy would get before anything is prepared.</> },
      { endpoint: "POST /launches/:mint/airdrop/prepare", text: <>The Creator&apos;s airdrop payments, however many transactions they take.</> },
      {
        endpoint: "POST /trades/prepare",
        text: (
          <>
            A buy or sell, on the curve or in the pool: <C>mint</C>, <C>trader</C>, <C>side</C>, <C>amount</C>, <C>slippageBps</C>, <C>payWith</C>, <C>referrer</C>. <C>amount</C> is in raw units of what is paid: the Quote Asset for a buy (lamports when <C>payWith</C> is <C>sol</C>), the coin for a sell.
          </>
        ),
      },
      { endpoint: "POST /transactions/:signature", text: <>Reports a confirmed transaction so it shows up at once, without waiting for the webhook.</> },
    ],
  },
  {
    id: "sign-send-report",
    title: "Sign, send, report",
    lead: (
      <>
        The same three steps for a launch, a trade or an airdrop: deserialize the transaction, sign it with the wallet it was prepared for, send it to the chain, then report its signature so it shows up at once rather than when the webhook delivers it. A launch transaction already carries the new mint&apos;s signature; the Creator&apos;s wallet signs as fee payer. In a browser a Wallet Standard wallet signs with <C>signTransaction</C>, and the rest is the same.
      </>
    ),
    body: (
      <figure className={styles.figure}>
        <figcaption className={styles.caption}>A buy, in JavaScript with web3.js</figcaption>
        <pre className={styles.block}>{SIGN_SEND_REPORT}</pre>
      </figure>
    ),
  },
  {
    id: "referrals",
    title: "Referrals",
    body: (
      <p className={styles.prose}>
        A trade prepared with <C>referrer</C> pays that wallet LaunchLab&apos;s share fee, on-chain, in the Quote Asset, at 0.5% (<C>REFERRAL_SHARE_BPS</C>, 50), where the Quote Asset&apos;s GlobalConfig allows a share fee (<C>referralShare</C> on <C>GET /quotes</C>; SOL&apos;s allows up to 1%, most others, every tokenized stock among them, allow none). The quote says whether it applies and what it pays (<C>referral</C>), the trade records it (<C>referral</C> on each trade), and the referrer&apos;s Quote Asset account is opened by the trader if it doesn&apos;t exist. A trader can&apos;t refer themselves, and a pool trade after Graduation pays no referral fee. The web app takes the referrer from <C>?ref=&lt;wallet&gt;</C> on a coin page.
      </p>
    ),
  },
  {
    id: "keys",
    title: "API keys and limits",
    body: (
      <>
        <p className={styles.prose}>
          Reads are open, and a caller without a key is bounded per IP address: 300 requests a minute, and 25 prepare requests a minute, answered past the limit with 429 and <C>retry-after</C>. The Helius webhook and the operator&apos;s endpoints are not counted. A key identifies an integrator, meters its usage and bounds it: send it in <C>x-api-key</C> on every request. Past the key&apos;s per-minute limit (60 unless the operator set another) the API answers 429 with <C>retry-after</C>; an unknown or revoked key is refused with 401. <C>GET /keys/me</C> shows the key&apos;s limit and its last hour of usage by minute, and stays reachable past the limit.
        </p>
        <p className={styles.prose}>
          Keys are issued by hand: write to <a href={`mailto:${SITE_LINKS.email}`}>{SITE_LINKS.email}</a> with what you are building and the rate you need. The operator issues them from the <C>/operator</C> page or directly: <C>POST /operator/api-keys</C> (<C>name</C>, <C>rateLimitPerMinute</C>, 60 by default) answers with the key once and never again; <C>GET /operator/api-keys</C> lists them without the key; <C>DELETE /operator/api-keys/:id</C> revokes one.
        </p>
      </>
    ),
  },
  {
    id: "errors",
    title: "Errors",
    lead: <>An error answers <C>{"{ \"error\": \"<one sentence>\" }"}</C>, with the status that says what kind it is.</>,
    rows: [
      {
        endpoint: "400",
        text: (
          <>
            The body or query isn&apos;t what the contract asks (<C>details</C> carries the validation issues, each with its <C>path</C> and <C>message</C>), an address that isn&apos;t a wallet address, a mint that is no Quote Asset, or a launch mode that can&apos;t be set up as given.
          </>
        ),
      },
      { endpoint: "401", text: <>An unknown or revoked key in <C>x-api-key</C>; the operator&apos;s endpoints without their token.</> },
      { endpoint: "403", text: <>A launch with an airdrop from a wallet the operator hasn&apos;t allowed one.</> },
      {
        endpoint: "404",
        text: <>No such coin, Quote Asset, round or key; <C>/rewards</C> of a coin that is no Reward Launch; <C>/airdrop</C> of a coin launched without one; a reported transaction not found or not confirmed yet.</>,
      },
      {
        endpoint: "409",
        text: (
          <>
            A launch whose name, ticker or image a coin inside its Copy Protection window already has (<C>copy</C> carries the verdict); a retry of a coin that has already launched (<C>details.mint</C>); an airdrop that can&apos;t be sent right now: every wallet paid, the coin not launched yet, or transactions handed out a moment ago that can still land (<C>details.retryAfterSeconds</C>); a pool Raydium has paused or that opens in a moment; a fee or rules change announced with too short a lead.
          </>
        ),
      },
      {
        endpoint: "422",
        text: <>Well-formed, but not as asked: a Quote Asset the curve rules don&apos;t admit at today&apos;s price, or a buy paid with SOL where no route exists or none fits one transaction.</>,
      },
      { endpoint: "429", text: <>Past a rate limit; <C>retry-after</C> says how many seconds to wait.</> },
      {
        endpoint: ["500", "503"],
        text: <>Ours: an internal error, or a dependency down for the moment (the price source, the SOL route, reading holders from the chain). Try again in a minute.</>,
      },
    ],
  },
  {
    id: "operator",
    title: "The operator's endpoints",
    lead: <>Behind <C>Authorization: Bearer &lt;OPERATOR_TOKEN&gt;</C>. Listed so what the operator can do is public; nothing here moves a user&apos;s funds.</>,
    rows: [
      {
        endpoint: "GET /operator/overview",
        text: <>Launches by status, rounds, burns, Launches with their metadata on Arweave and still waiting (<C>metadataUploads</C>), the latest run of each job, open alerts, the fees on-chain.</>,
      },
      { endpoint: "GET /operator/alerts", text: <>Alerts: a stuck Graduation, a Reward Tax left unlocked, a failed job, a stalled Reward Round; each resolved when its cause goes away.</> },
      { endpoint: "GET /operator/jobs?job=", text: <>Job runs and unsettled job transactions.</> },
      {
        endpoint: "POST /operator/jobs/:job",
        text: (
          <>
            Runs a job now: <C>quote-registry</C>, <C>fee-collector</C>, <C>creator-forward</C>, <C>reward-rounds</C>, <C>burn</C> or <C>metadata-upload</C>; <C>?fail=simulated</C> makes it fail on purpose to see the alert path.
          </>
        ),
      },
      { endpoint: "POST /operator/rewards/rules", text: <>Announces a Reward Round rules change, effective no sooner than the announced lead ahead.</> },
      { endpoint: "PUT /operator/platform-token", text: <>Names the Platform Token the Burn buys.</> },
      {
        endpoint: ["GET /operator/airdrop-creators", "POST /operator/airdrop-creators", "DELETE /operator/airdrop-creators/:wallet"],
        text: <>The Creator wallets allowed an airdrop at launch (<C>wallet</C>). The list starts empty, so nobody is offered one until the operator names a wallet.</>,
      },
      {
        endpoint: ["GET /operator/mint-keys", "POST /operator/mint-keys", "DELETE /operator/mint-keys/:mint"],
        text: (
          <>
            Mint keys chosen for a Creator wallet&apos;s next launch (<C>creator</C>, <C>secretKey</C>: a keypair file&apos;s 64 bytes), kept encrypted; the list says which a draft has taken, never the secret. A taken key can&apos;t be removed; a stored address that is already a coin or draft here is refused.
          </>
        ),
      },
      {
        endpoint: ["POST /operator/fees/announce", "POST /operator/fees/prepare"],
        text: (
          <>
            Announces a Platform Fee or Creator Fee change, effective no sooner than a day ahead on mainnet, and once due prepares the <C>update_platform_config</C> transaction for the cold admin key. The Indexer marks the announcement applied when the change lands.
          </>
        ),
      },
      { endpoint: ["POST /operator/api-keys", "GET /operator/api-keys", "DELETE /operator/api-keys/:id"], text: <>See API keys and limits.</> },
    ],
  },
];
