import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatform, getQuoteAsset, listLaunches, listLaunchQuotes } from "@/lib/api";
import { assetKind, CATEGORY_NOTES, formatUsd, graduationInWords, marketNote, marketTitle, tokenProgramName } from "@/lib/assets";
import { formatMarketValue } from "@/lib/board";
import { quoteTicker } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { MarketChart } from "@/components/MarketChart";
import { QuoteLabelList } from "@/components/QuoteLabels";
import { QuoteLogo } from "@/components/QuoteLogo";
import styles from "./page.module.css";
import { Address } from "@/components/Address";
import { CoinImage } from "@/components/CoinImage";
import { EmptyState } from "@/components/EmptyState";
import { Price } from "@/components/Price";
import { RelativeTime } from "@/components/RelativeTime";

type Props = { params: Promise<{ mint: string }> };

const COINS_SHOWN = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quote = await getQuoteAsset((await params).mint).catch(() => null);
  return quote
    ? { title: `${quoteTicker(quote)} as a Quote Asset`, description: `Launch a coin priced in ${quoteTicker(quote)}: its price, what a coin raises to graduate, and what is known about it.` }
    : { title: "Asset not found" };
}

/**
 * One Quote Asset (ADR 0010): the facts a Creator or trader checks before pairing with it, TradingView's chart of the
 * market behind it when one is known (#124), the coins already paired with it, and under "Further information" what its
 * mint and the token list say about it, the one place on the site those facts sit beside its name.
 */
export default async function AssetPage({ params }: Props) {
  const { mint } = await params;
  const quote = await getQuoteAsset(mint);
  if (!quote) notFound();
  const [platform, paired, inUse] = await Promise.all([
    getPlatform(),
    listLaunches({ quote: mint, sort: "market_cap", limit: COINS_SHOWN }),
    listLaunchQuotes(),
  ]);
  const ticker = quoteTicker(quote);
  const coins = inUse.quotes.find((q) => q.mint === mint)?.launches ?? 0;
  const target = graduationInWords(quote);
  const addresses: (readonly [label: string, value: string])[] = [["Mint", quote.mint], ["Raydium GlobalConfig", quote.globalConfig]];

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <QuoteLogo quote={quote} size={64} />
        <div className={styles.titles}>
          <h1 className={`t-h1 ${styles.ticker}`}>{ticker}</h1>
          <p className={styles.name}>
            {quote.name && quote.name.toLowerCase() !== quote.symbol?.toLowerCase() ? `${quote.name} · ` : ""}
            {assetKind(quote)}
          </p>
          <p className={styles.note}>{CATEGORY_NOTES[quote.category]}</p>
        </div>
        <div className={styles.action}>
          {quote.launchable ? (
            <Link href={`/launch?quote=${quote.mint}`} className="button button-primary">Stoke a coin paired with {ticker}</Link>
          ) : (
            <p className={styles.reason}>{quote.reason}</p>
          )}
        </div>
      </header>

      <section className={styles.panels}>
        <dl className={`card ${styles.facts}`} aria-label={`${ticker} facts`}>
          <div>
            <dt>Price</dt>
            <dd>
              {quote.price ? (
                <>
                  <span className="mono">{quote.price.usd ? formatUsd(quote.price.usd) : <><Price value={Number(quote.price.sol)} /> SOL</>}</span>
                  {quote.price.usd && <span className={styles.aside}><Price value={Number(quote.price.sol)} /> SOL</span>}
                  {/* Priced when the registry last read the market; a reading older than an hour is marked, so nobody trusts it unawares. */}
                  <span className={styles.aside} data-priced>priced <RelativeTime iso={quote.price.at} now={Date.now()} staleAfter={3600} /></span>
                </>
              ) : (
                "No reliable price"
              )}
            </dd>
          </div>
          <div>
            <dt>A coin graduates at</dt>
            <dd>
              {target ? (
                <>
                  <span className="mono">{target.amount}</span>
                  <span className={styles.aside}>worth {target.sol} when set</span>
                </>
              ) : (
                "No Graduation Target without a price"
              )}
            </dd>
          </div>
          <div>
            <dt>Referral share</dt>
            <dd>
              {quote.referralShare.allowed
                ? `${quote.referralShare.bps / 100}% of a referred trade, paid on-chain to the referrer`
                : "None: this asset's Raydium config allows no share fee"}
            </dd>
          </div>
          <div>
            <dt>Token program</dt>
            <dd>
              {tokenProgramName(quote.tokenProgram)}
              <span className={styles.aside}>{quote.decimals} decimals</span>
            </dd>
          </div>
        </dl>

        <dl className={`card ${styles.addresses}`} aria-label={`${ticker} addresses`}>
          {addresses.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Address value={value} platform={platform} />
                <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
              </dd>
            </div>
          ))}
          <div>
            <dt>Coins paired with {ticker}</dt>
            <dd>
              {coins.toLocaleString("en-US")}
              {coins > 0 && <Link href={`/coins?quote=${quote.mint}`} className={styles.factLink}>See them on the board</Link>}
            </dd>
          </div>
        </dl>

        {quote.market && (
          <section className={`card ${styles.wide} ${styles.card}`} aria-labelledby="market-title">
            <h2 id="market-title" className={`t-h3 ${styles.cardTitle}`}>{marketTitle(quote.market)}</h2>
            <p className={styles.cardNote}>{marketNote(ticker, quote.category)}</p>
            <MarketChart market={quote.market} />
          </section>
        )}

        <section className={`card ${styles.wide} ${styles.card}`} aria-labelledby="paired-coins-title">
          <h2 id="paired-coins-title" className={`t-h3 ${styles.cardTitle}`}>Coins priced in {ticker}</h2>
          {paired.launches.length === 0 ? (
            <EmptyState
              bare
              title={quote.launchable ? `Be the first to pair a coin with ${ticker}` : `Coins paired with ${ticker} appear here`}
              action={quote.launchable ? <Link href={`/launch?quote=${quote.mint}`} className="button button-primary">Stoke a coin paired with {ticker}</Link> : undefined}
            >
              {quote.launchable ? `None yet. The first coin paired with ${ticker} could be yours.` : `None yet: ${ticker} cannot be launched against today.`}
            </EmptyState>
          ) : (
            <ul className={styles.coins} aria-label={`Coins paired with ${ticker}`}>
              {paired.launches.map((l) => (
                <li key={l.mint}>
                  <Link href={`/coin/${l.mint}`} className={styles.coin}>
                    <CoinImage src={l.image} symbol={l.symbol} size={22} />
                    <span className={styles.coinSymbol}>{l.symbol}</span>
                    <span className={styles.coinName}>{l.name}</span>
                    <span className={`mono ${styles.coinCap}`}>{l.market.marketCap ? formatMarketValue(l.market.marketCap, l.quote) : "-"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {coins > paired.launches.length && (
            <Link href={`/coins?quote=${quote.mint}`} className={styles.factLink}>All {coins.toLocaleString("en-US")} coins</Link>
          )}
        </section>

        <section className={`card ${styles.wide} ${styles.card}`} aria-labelledby="further-title">
          <h2 id="further-title" className={`t-h3 ${styles.cardTitle}`}>Further information</h2>
          <p className={styles.cardNote}>
            What {ticker}&apos;s mint and the token list say about it, read again at every Quote Registry refresh. Each fact informs a Creator or
            trader; none stops a launch or a trade.
          </p>
          <QuoteLabelList quote={quote} />
        </section>
      </section>

      <Link href="/assets" className={`button button-ghost ${styles.back}`}>All assets</Link>
    </article>
  );
}
