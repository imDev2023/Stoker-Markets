import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatform, getQuoteAsset, listLaunches, listLaunchQuotes } from "@/lib/api";
import { assetKind, CATEGORY_NOTES, formatUsd, graduationInWords, marketNote, marketTitle, tokenProgramName } from "@/lib/assets";
import { isSol, quoteTicker } from "@/lib/format";
import { Address } from "@/components/Address";
import { CoinTable } from "@/components/CoinTable";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState } from "@/components/EmptyState";
import { MarketChart } from "@/components/MarketChart";
import { Price } from "@/components/Price";
import { QuoteLabelList } from "@/components/QuoteLabels";
import { QuoteLogo } from "@/components/QuoteLogo";
import { RelativeTime } from "@/components/RelativeTime";
import styles from "./page.module.css";

type Props = { params: Promise<{ mint: string }> };

const COINS_SHOWN = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quote = await getQuoteAsset((await params).mint).catch(() => null);
  return quote
    ? { title: `${quoteTicker(quote)} as a Quote Asset`, description: `Launch a coin priced in ${quoteTicker(quote)}: its price, what a coin raises to graduate, and what is known about it.` }
    : { title: "Asset not found" };
}

/**
 * One Quote Asset (ADR 0010, reworked in #135): the facts a Creator or trader checks before pairing with it in one
 * definition list, TradingView's chart of the market behind it when one is known (#124), the coins already paired
 * with it as the board lists them, and under "Further information" what its mint and the token list say about it,
 * the one place on the site those facts sit beside its name. "Stoke a coin paired with X" is the page's one action.
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
  const now = Date.now();
  // The name and the kind under the title, each once: SOL's name is its kind ("Solana"), so it is not said twice.
  const kind = assetKind(quote);
  const name = quote.name && quote.name.toLowerCase() !== quote.symbol?.toLowerCase() ? quote.name : null;
  const subtitle = [name, kind].filter((s, i, all) => s && all.indexOf(s) === i).join(" · ");

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <QuoteLogo quote={quote} size={64} />
        <div className={styles.titles}>
          <h1 className={`t-h1 ${styles.ticker}`}>{ticker}</h1>
          <p className={styles.name}>{subtitle}</p>
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

      <dl className={`card ${styles.facts}`} aria-label={`${ticker} facts`}>
        <div>
          <dt>Price</dt>
          <dd>
            {quote.price ? (
              <>
                <span className="mono">{quote.price.usd ? formatUsd(quote.price.usd) : <><Price value={Number(quote.price.sol)} /> SOL</>}</span>
                {quote.price.usd && !isSol(quote) && <span className={styles.aside}><Price value={Number(quote.price.sol)} /> SOL</span>}
                {/* Priced when the registry last read the market; a reading older than an hour is marked, so nobody trusts it unawares. */}
                <span className={styles.aside} data-priced>priced <RelativeTime iso={quote.price.at} now={now} staleAfter={3600} /></span>
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
                {/* The target is set in SOL and converted; for SOL itself there is nothing to convert. */}
                {!isSol(quote) && <span className={styles.aside}>worth {target.sol} when set</span>}
              </>
            ) : (
              "No Graduation Target without a price"
            )}
          </dd>
        </div>
        <div>
          <dt>Coins paired with {ticker}</dt>
          <dd>
            <span className="mono">{coins.toLocaleString("en-US")}</span>
            {coins > 0 && <Link href={`/coins?quote=${quote.mint}`} className={styles.factLink}>See them on the board</Link>}
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
        {([["Mint", quote.mint], ["Raydium GlobalConfig", quote.globalConfig]] as const).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Address value={value} platform={platform} />
              <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
            </dd>
          </div>
        ))}
      </dl>

      {quote.market && (
        <section className={`card ${styles.card}`} aria-labelledby="market-title">
          <h2 id="market-title" className={`t-h3 ${styles.cardTitle}`}>{marketTitle(quote.market)}</h2>
          <p className={styles.cardNote}>{marketNote(ticker, quote.category)}</p>
          <MarketChart market={quote.market} />
        </section>
      )}

      <section className={styles.coins} aria-labelledby="paired-coins-title">
        <div className={styles.coinsHead}>
          <h2 id="paired-coins-title" className={`t-h3 ${styles.cardTitle}`}>Coins priced in {ticker}</h2>
          {coins > paired.launches.length && (
            <Link href={`/coins?quote=${quote.mint}`} className={styles.factLink}>All {coins.toLocaleString("en-US")} coins</Link>
          )}
        </div>
        {paired.launches.length === 0 ? (
          <EmptyState
            title={quote.launchable ? `Be the first to pair a coin with ${ticker}` : `Coins paired with ${ticker} appear here`}
            action={quote.launchable ? <Link href={`/launch?quote=${quote.mint}`} className="button button-primary">Stoke a coin paired with {ticker}</Link> : undefined}
          >
            {quote.launchable ? `None yet. The first coin paired with ${ticker} could be yours.` : `None yet: ${ticker} cannot be launched against today.`}
          </EmptyState>
        ) : (
          <CoinTable launches={paired.launches} now={now} label={`Coins paired with ${ticker}`} />
        )}
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="further-title">
        <h2 id="further-title" className={`t-h3 ${styles.cardTitle}`}>Further information</h2>
        <p className={styles.cardNote}>
          What {ticker}&apos;s mint and the token list say about it, read again at every Quote Registry refresh. Each fact informs a Creator or
          trader; none stops a launch or a trade.
        </p>
        <QuoteLabelList quote={quote} />
      </section>

      <Link href="/assets" className={`button button-ghost ${styles.back}`}>All assets</Link>
    </article>
  );
}
