import { creatorEarnings } from "@/lib/fees";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAirdrop, getCandles, getCoinRewards, getHolders, getLaunch, getPlatform, getQuoteAsset, listTrades } from "@/lib/api";
import { explorerUrl, formatUtc, isSol, quoteTicker, shortAddress } from "@/lib/format";
import { AirdropCard } from "@/components/AirdropCard";
import { CoinMarket } from "@/components/CoinMarket";
import { CopyButton } from "@/components/CopyButton";
import { PairLockup, PairStats, QuoteCard } from "@/components/PairCards";
import { PairMark } from "@/components/PairMark";
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
  const launch = await getLaunch((await params).mint);
  return { title: launch ? `${launch.symbol} / ${quoteTicker(launch.quote)}` : "Coin not found" };
}

/**
 * A coin's page is its pair's page (docs/design/layout.md): the lockup of both marks as the header, the pair's figures
 * in a strip, the market with the Quote Asset's card beside the trade panel, and the facts under it.
 */
export default async function CoinPage({ params, searchParams }: Props) {
  const { mint } = await params;
  const referrer = referrerFrom(await searchParams);
  const [launch, platform, trades, candles, holders, airdrop] = await Promise.all([
    getLaunch(mint), getPlatform(), listTrades(mint), getCandles(mint, "1m"),
    // A 404 (no such coin) or an unreadable chain leaves the card to retry, rather than failing the page.
    getHolders(mint).catch(() => null),
    getAirdrop(mint),
  ]);
  if (!launch) notFound();
  const rewards = launch.rewardTax ? await getCoinRewards(mint).catch(() => null) : null;
  // The Quote Asset's card and the stats strip want its price and liquidity; its labels are shown for any asset but SOL (#11).
  const quoteAsset = await getQuoteAsset(launch.quote.mint).catch(() => null);
  // An Airdrop still being paid sits above the market, where its Creator sends it; a finished one joins the facts below.
  const earns = creatorEarnings(platform);
  const airdropCard = airdrop && <AirdropCard initial={airdrop} symbol={launch.symbol} platform={platform} />;
  const protectionOpen = new Date(launch.protection.until).getTime() <= Date.now();
  const airdropDone = airdrop?.recipients.every((r) => r.status === "paid") ?? false;
  const quote = quoteTicker(launch.quote);
  const addresses: (readonly [label: string, value: string, kind: "address" | "tx"])[] = [
    ["Creator", launch.creator, "address"],
    ["Coin", launch.mint, "address"],
    ["Curve", launch.pool, "address"],
    ["Launch transaction", launch.createdSignature, "tx"],
    ...(launch.graduation
      ? ([["Raydium pool", launch.graduation.pool, "address"], ["Graduation transaction", launch.graduation.signature, "tx"]] as const)
      : []),
  ];
  const links = [
    ["Website", launch.links.website],
    ["X", launch.links.x],
    ["Telegram", launch.links.telegram],
  ].filter((l): l is [string, string] => Boolean(l[1]));

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <PairLockup launch={launch} />
        <div className={styles.titles}>
          <h1 className={styles.pair}>
            <PairMark base={launch.symbol} quote={quote} size="fit" />
          </h1>
          <p className={styles.name}>{launch.name}</p>
          {links.length > 0 && (
            <ul className={styles.links}>
              {links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="chip" target="_blank" rel="noreferrer nofollow">{label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {launch.description && <p className={styles.description}>{launch.description}</p>}

      {!airdropDone && airdropCard}

      <PairStats launch={launch} quoteAsset={quoteAsset} />

      <CoinMarket
        initial={launch} platform={platform} initialTrades={trades.trades} initialCandles={candles} initialHolders={holders} renderedAt={Date.now()}
        referrer={referrer} aside={<QuoteCard launch={launch} quoteAsset={quoteAsset} />}
      />

      <section className={styles.panels}>
        <dl className={`card ${styles.facts}`}>
          <div>
            <dt>Creator earns</dt>
            <dd>
              {earns.summary}
              <span>Half of what the platform collects on this coin, sent to the Creator&apos;s wallet with nothing to claim.</span>
            </dd>
          </div>
          {launch.rewardTax && (
            <div>
              <dt>Reward tax</dt>
              <dd>
                {launch.rewardTax.bps / 100}% of every transfer, paid out to holders in {launch.rewardTax.payout === "coin" ? launch.symbol : quote}
                {launch.rewardTax.locked ? (
                  <span className={styles.verified}>
                    Fixed for good:{" "}
                    <a href={explorerUrl("tx", launch.rewardTax.locked.signature, platform)} target="_blank" rel="noreferrer">
                      authority given up
                    </a>
                  </span>
                ) : (
                  <span className={styles.verified}>Fixed: LaunchLab holds the tax authority until graduation</span>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>Launched</dt>
            <dd>
              <time dateTime={launch.createdAt}>
                {formatUtc(launch.createdAt)}
              </time>
            </dd>
          </div>
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
          {launch.graduation && (
            <div>
              <dt>Graduated</dt>
              <dd>
                <time dateTime={launch.graduation.graduatedAt}>{formatUtc(launch.graduation.graduatedAt)}</time>
              </dd>
            </div>
          )}
        </dl>

        <dl className={`card ${styles.addresses}`}>
          {addresses.map(([label, value, kind]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <a className="mono" href={explorerUrl(kind, value, platform)} target="_blank" rel="noreferrer">
                  {shortAddress(value)}
                </a>
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

      <Link href="/coins" className={`button button-ghost ${styles.back}`}>All coins</Link>
    </article>
  );
}

/** How a coin took an earlier coin's identity, as the label's opening words. */
function copyKind(kind: "ticker" | "name" | "image" | "near") {
  return { ticker: "Its ticker is", name: "Its name is", image: "Its image is", near: "Its name or ticker is a near copy of" }[kind] + (kind === "near" ? "" : " that of");
}
