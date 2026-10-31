import { creatorEarnings } from "@/lib/fees";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAirdrop, getCandles, getCoinRewards, getHolders, getLaunch, getPlatform, getQuoteAsset, getTrust, listTrades } from "@/lib/api";
import { explorerUrl, formatShare, formatUtc, isSol, quoteTicker } from "@/lib/format";
import { breadcrumbList, clip, pageMeta } from "@/lib/meta";
import { siteOrigin } from "@/lib/origin";
import { Address } from "@/components/Address";
import { AirdropCard } from "@/components/AirdropCard";
import { CoinMarket, type CoinLink } from "@/components/CoinMarket";
import { CopyButton } from "@/components/CopyButton";
import { JsonLd } from "@/components/JsonLd";
import { QuoteLabelList } from "@/components/QuoteLabels";
import { RewardsCard } from "@/components/RewardsCard";
import styles from "./page.module.css";

type Props = { params: Promise<{ mint: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A referral link's wallet (`?ref=`), taken only when it looks like a Solana address. */
function referrerFrom(params: Record<string, string | string[] | undefined>) {
  const ref = params.ref;
  return typeof ref === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ref) ? ref : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mint } = await params;
  const [launch, platform] = await Promise.all([getLaunch(mint), getPlatform()]);
  if (!launch) return pageMeta({ path: `/coin/${mint}`, title: "Coin not found", index: false });
  const quote = quoteTicker(launch.quote);
  // Its own description when the Creator wrote one; otherwise its pair and what its Creator earns (#83).
  const description = launch.description?.trim()
    || `${launch.name} (${launch.symbol}) trades on Stoker paired with ${quote}; its creator earns ${creatorEarnings(platform).headline}, every payment on the public ledger.`;
  return pageMeta({ path: `/coin/${launch.mint}`, title: `${launch.symbol} / ${quote}`, description: clip(description), card: "own" });
}

/**
 * A coin's page (#134, phase 3 of the rework): a breadcrumb, a one-line title row (the lockup at 40px, the pair, the
 * name with the coin's links, the three trust marks and the price with the day's change), the market (the chart with
 * the graduation bar and the activity under it, the trade panel docked beside it with the pair's other half), and
 * below the fold one About block with the description, the launch's details and the addresses.
 */
export default async function CoinPage({ params, searchParams }: Props) {
  const { mint } = await params;
  const referrer = referrerFrom(await searchParams);
  const [launch, platform, trades, candles, holders, trust, airdrop] = await Promise.all([
    getLaunch(mint), getPlatform(), listTrades(mint), getCandles(mint, "1m"),
    // A 404 (no such coin) or an unreadable chain leaves the cards to retry, rather than failing the page.
    getHolders(mint).catch(() => null),
    getTrust(mint).catch(() => null),
    getAirdrop(mint),
  ]);
  if (!launch) notFound();
  const rewards = launch.rewardTax ? await getCoinRewards(mint).catch(() => null) : null;
  // The Quote Asset's card wants its price and liquidity; its labels are shown for any asset but SOL (#11).
  const quoteAsset = await getQuoteAsset(launch.quote.mint).catch(() => null);
  // An Airdrop still being paid sits under the title row, where its Creator sends it; a finished one joins the facts below.
  const earns = creatorEarnings(platform);
  const airdropCard = airdrop && <AirdropCard initial={airdrop} symbol={launch.symbol} platform={platform} />;
  const protectionOpen = new Date(launch.protection.until).getTime() <= Date.now();
  const airdropDone = airdrop?.recipients.every((r) => r.status === "paid") ?? false;
  const quote = quoteTicker(launch.quote);
  const origin = await siteOrigin();
  const addresses: (readonly [label: string, value: string, kind: "address" | "tx"])[] = [
    ["Creator", launch.creator, "address"],
    ["Coin", launch.mint, "address"],
    ["Curve", launch.pool, "address"],
    ["Launch transaction", launch.createdSignature, "tx"],
    ...(launch.graduation
      ? ([["Raydium pool", launch.graduation.pool, "address"], ["Graduation transaction", launch.graduation.signature, "tx"]] as const)
      : []),
  ];
  // The coin's own links and the explorer in the title row (#134); the aggregators, which know mainnet alone, under About (#41).
  const links: CoinLink[] = [
    { label: "Website", href: launch.links.website ?? "", external: true },
    { label: "X", href: launch.links.x ?? "", external: true },
    { label: "Telegram", href: launch.links.telegram ?? "", external: true },
    { label: "Explorer", href: explorerUrl("address", launch.mint, platform), external: false },
  ].filter((l) => l.href);
  const elsewhere: [string, string][] = [
    ["DEX Screener", `https://dexscreener.com/solana/${launch.mint}`],
    ["Jupiter", `https://jup.ag/swap/${launch.quote.mint}-${launch.mint}`],
  ];
  const liquidity = launch.curve.status === "graduated"
    ? "Locked in its Raydium pool since graduation; its price is not."
    : launch.curve.status === "graduating"
      ? "The curve sold out; Raydium is moving the coin to its pool."
      : "On its bonding curve until the Graduation Target is raised; then locked in a Raydium pool.";

  return (
    <article className={`shell ${styles.page}`}>
      <JsonLd data={breadcrumbList(origin, [["Home", "/"], ["Coins", "/coins"], [`${launch.symbol} / ${quote}`, `/coin/${launch.mint}`]])} />
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <ol>
          <li><Link href="/coins">Explore</Link></li>
          <li><Link href={`/coins?quote=${launch.quote.mint}`}>Paired with {quote}</Link></li>
          <li aria-current="page">{launch.symbol}</li>
        </ol>
      </nav>

      {/* The title row and the pair card are drawn by the market component from data: a server-rendered tree handed through the
          client boundary as a prop warned about missing keys whenever one of its pieces streamed in late (2026-10-31). */}
      <CoinMarket
        initial={launch} platform={platform} quoteAsset={quoteAsset} links={links} initialTrades={trades.trades} initialCandles={candles} initialHolders={holders}
        initialTrust={trust} renderedAt={Date.now()} referrer={referrer} notice={!airdropDone && airdropCard}
      />

      <section className={`grid ${styles.about}`} aria-labelledby="about-title">
        <div className={`card col-7 ${styles.aboutCard}`}>
          <h2 id="about-title" className={`t-h3 ${styles.aboutTitle}`}>About {launch.symbol}</h2>
          {launch.description && <p className={styles.description}>{launch.description}</p>}
          <dl className={styles.facts}>
            <div>
              <dt>Launch type</dt>
              <dd>{launch.rewardTax ? "Reward Launch" : "Standard coin"}</dd>
            </div>
            {launch.rewardTax && (
              <div>
                <dt>Reward tax</dt>
                <dd>
                  {launch.rewardTax.bps / 100}% of every transfer, paid out to holders in {launch.rewardTax.payout === "coin" ? launch.symbol : quote}
                  {launch.rewardTax.locked ? (
                    <span>
                      Fixed for good:{" "}
                      <a href={explorerUrl("tx", launch.rewardTax.locked.signature, platform)} target="_blank" rel="noreferrer">
                        authority given up
                      </a>
                    </span>
                  ) : (
                    <span>Fixed: LaunchLab holds the tax authority until graduation</span>
                  )}
                </dd>
              </div>
            )}
            {trust && (
              <div>
                <dt>First Buy</dt>
                <dd>{trust.creator.firstBuy ? `${formatShare(trust.creator.firstBuy.share)} of the supply, bought by the Creator at launch` : "None: the Creator bought nothing at launch"}</dd>
              </div>
            )}
            <div>
              <dt>Creator earns</dt>
              <dd>
                {earns.summary}
                <span>Half of what the platform collects on this coin, sent to the Creator&apos;s wallet with nothing to claim.</span>
              </dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd>{liquidity}</dd>
            </div>
            <div>
              <dt>Launched</dt>
              <dd>
                <time dateTime={launch.createdAt}>{formatUtc(launch.createdAt)}</time>
              </dd>
            </div>
            {launch.graduation && (
              <div>
                <dt>Graduated</dt>
                <dd>
                  <time dateTime={launch.graduation.graduatedAt}>{formatUtc(launch.graduation.graduatedAt)}</time>
                </dd>
              </div>
            )}
            <div>
              <dt>Copy protection {protectionOpen ? "ended" : "until"}</dt>
              <dd>
                <time dateTime={launch.protection.until}>{formatUtc(launch.protection.until)}</time>
                <span>
                  {protectionOpen
                    ? "Anyone may use this coin's name, ticker and image again."
                    : "Until then nobody else can launch a coin here with this name, ticker or image."}
                  {launch.copyOf && (
                    <>
                      {" "}
                      {copyKind(launch.copyOf.kind)}{" "}
                      <Link href={`/coin/${launch.copyOf.mint}`}>{launch.copyOf.name} ({launch.copyOf.symbol})</Link>, launched{" "}
                      <time dateTime={launch.copyOf.launchedAt}>{formatUtc(launch.copyOf.launchedAt)}</time>
                    </>
                  )}
                </span>
              </dd>
            </div>
            <div>
              <dt>Elsewhere</dt>
              <dd className={styles.elsewhere}>
                {elsewhere.map(([label, href]) => (
                  <a key={label} href={href} className="chip" target="_blank" rel="noreferrer">{label}</a>
                ))}
              </dd>
            </div>
          </dl>
        </div>

        <dl className={`card col-5 ${styles.addresses}`} aria-label="Addresses">
          {addresses.map(([label, value, kind]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Address value={value} kind={kind} platform={platform} />
                <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
              </dd>
            </div>
          ))}
        </dl>

        {quoteAsset && !isSol(launch.quote) && (
          <section className={`card ${styles.wide} ${styles.quoteLabels}`} aria-labelledby="quote-labels-title">
            <h2 id="quote-labels-title" className={`t-h3 ${styles.quoteLabelsTitle}`}>Paired with {quote}</h2>
            <p className={styles.quoteLabelsNote}>
              Every trade of {launch.symbol} is paid in {quote}. What its mint and the token list say about {quote}; each label informs
              and none stops a trade.
            </p>
            <QuoteLabelList quote={quoteAsset} />
            <Link href={`/assets/${quoteAsset.mint}`} className={styles.factLink}>Everything about {quote}</Link>
          </section>
        )}
        {rewards && <div className={styles.wide}><RewardsCard rewards={rewards} symbol={launch.symbol} platform={platform} /></div>}
        {airdropDone && <div className={styles.wide}>{airdropCard}</div>}
      </section>
    </article>
  );
}

/** How a coin took an earlier coin's identity, as the label's opening words. */
function copyKind(kind: "ticker" | "name" | "image" | "near") {
  return { ticker: "Its ticker is", name: "Its name is", image: "Its image is", near: "Its name or ticker is a near copy of" }[kind] + (kind === "near" ? "" : " that of");
}
