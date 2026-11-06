import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAirdrop, getCoinRewards, getHolders, getLaunch, getPlatform, getQuoteAsset, getTrust, listTrades } from "@/lib/api";
import { explorerUrl, isSol, quoteTicker } from "@/lib/format";
import { breadcrumbList, clip, pageMeta } from "@/lib/meta";
import { siteOrigin } from "@/lib/origin";
import { AirdropCard } from "@/components/AirdropCard";
import { CoinMarket, type CoinLink } from "@/components/CoinMarket";
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
  const launch = await getLaunch(mint);
  if (!launch) return pageMeta({ path: `/coin/${mint}`, title: "Coin not found", index: false });
  const quote = quoteTicker(launch.quote);
  // Its own description when the Creator wrote one; otherwise its pair and what its Creator earns (#83).
  const description = launch.description?.trim()
    || `${launch.name} (${launch.symbol}) trades on Stoker paired with ${quote}; its creator earns half of what the platform collects on its trades, every payment on the public ledger.`;
  return pageMeta({ path: `/coin/${launch.mint}`, title: `${launch.symbol} / ${quote}`, description: clip(description), card: "own" });
}

/**
 * A coin's page (#134, phase 3 of the rework): a breadcrumb, a one-line title row (the lockup at 40px, the pair, the
 * name with the explorer link, the three trust marks and the price with the day's change), the market (the chart with
 * the graduation bar and the activity under it, the trade panel docked beside it with the pair's other half and, under
 * those, the About block with the description, the launch's details, the coin's links and the addresses: owner,
 * 2026-10-31, the facts belong under the trade panel as the terminals place them), and below the grid only what some
 * coins have: the Quote Asset's labels, the rewards and a finished Airdrop.
 */
export default async function CoinPage({ params, searchParams }: Props) {
  const { mint } = await params;
  const referrer = referrerFrom(await searchParams);
  const [launch, platform, trades, holders, trust, airdrop] = await Promise.all([
    getLaunch(mint), getPlatform(), listTrades(mint),
    // A 404 (no such coin) or an unreadable chain leaves the cards to retry, rather than failing the page.
    getHolders(mint).catch(() => null),
    getTrust(mint).catch(() => null),
    getAirdrop(mint),
  ]);
  if (!launch) notFound();
  const rewards = launch.rewardTax ? await getCoinRewards(mint).catch(() => null) : null;
  // The Quote Asset's card wants its price and liquidity; its labels are shown for any asset but SOL (#11).
  const quoteAsset = await getQuoteAsset(launch.quote.mint).catch(() => null);
  // An Airdrop still being paid sits under the title row, where its Creator sends it (the market component draws it); a finished one joins the cards below.
  const airdropDone = airdrop?.recipients.every((r) => r.status === "paid") ?? false;
  const quote = quoteTicker(launch.quote);
  const origin = await siteOrigin();
  // The explorer in the title row; the coin's own links (website, X, Telegram) are a fact of the About block, which the
  // market component draws under the trade panel (owner, 2026-10-31).
  const links: CoinLink[] = [{ label: "Explorer", href: explorerUrl("address", launch.mint, platform), external: false }];

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

      {/* The title row, the pair card, the About block and the Airdrop card are all drawn by the market component from data:
          a server-rendered tree handed through the client boundary as a prop warns about missing keys when the client
          re-renders with it (2026-10-31: the pair card first, then the Airdrop card the moment a wallet connected). */}
      <CoinMarket
        initial={launch} platform={platform} quoteAsset={quoteAsset} links={links} initialTrades={trades.trades} initialHolders={holders}
        initialTrust={trust} renderedAt={Date.now()} referrer={referrer} airdrop={airdropDone ? null : airdrop}
      />

      {(quoteAsset && !isSol(launch.quote)) || rewards || airdropDone ? (
        <section className={`grid ${styles.more}`} aria-label="More about this coin">

          {quoteAsset && !isSol(launch.quote) && (
            <section className={`card ${styles.wide} ${styles.quoteLabels}`} aria-labelledby="quote-labels-title">
              {/* The ticker is the way to the asset's page (owner, 2026-10-31: no "Everything about" link). */}
              <h2 id="quote-labels-title" className={`t-h3 ${styles.quoteLabelsTitle}`}>Paired with <Link href={`/assets/${quoteAsset.mint}`}>{quote}</Link></h2>
              <p className={styles.quoteLabelsNote}>
                Every trade of {launch.symbol} is paid in {quote}. What its mint and the token list say about {quote}; each label informs
                and none stops a trade.
              </p>
              <QuoteLabelList quote={quoteAsset} />
            </section>
          )}
          {rewards && <div className={styles.wide}><RewardsCard rewards={rewards} symbol={launch.symbol} platform={platform} /></div>}
          {airdropDone && airdrop && <div className={styles.wide}><AirdropCard initial={airdrop} symbol={launch.symbol} platform={platform} /></div>}
        </section>
      ) : null}
    </article>
  );
}

