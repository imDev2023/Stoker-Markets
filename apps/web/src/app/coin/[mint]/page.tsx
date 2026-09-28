import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCandles, getLaunch, getPlatform, listTrades } from "@/lib/api";
import { explorerUrl, quoteSymbol, shortAddress } from "@/lib/format";
import { CoinMarket } from "@/components/CoinMarket";
import { CopyButton } from "@/components/CopyButton";
import { PairMark } from "@/components/PairMark";
import styles from "./page.module.css";

type Props = { params: Promise<{ mint: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const launch = await getLaunch((await params).mint);
  return { title: launch ? `${launch.symbol} / ${quoteSymbol(launch.quoteMint)}` : "Coin not found" };
}

export default async function CoinPage({ params }: Props) {
  const { mint } = await params;
  const [launch, platform, trades, candles] = await Promise.all([
    getLaunch(mint), getPlatform(), listTrades(mint), getCandles(mint, "1m"),
  ]);
  if (!launch) notFound();
  const quote = quoteSymbol(launch.quoteMint);
  const links = [
    ["Website", launch.links.website],
    ["X", launch.links.x],
    ["Telegram", launch.links.telegram],
  ].filter((l): l is [string, string] => Boolean(l[1]));

  return (
    <article className={`shell ${styles.page}`}>
      <header className={styles.head}>
        {launch.image ? <img className={styles.image} src={launch.image} alt="" width={112} height={112} /> : <div className={styles.image} />}
        <div className={styles.titles}>
          <h1 className={styles.pair}>
            <PairMark base={launch.symbol} quote={quote} size="fit" />
          </h1>
          <p className={styles.name}>{launch.name}</p>
          {links.length > 0 && (
            <ul className={styles.links}>
              {links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noreferrer nofollow">{label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {launch.description && <p className={styles.description}>{launch.description}</p>}

      <CoinMarket initial={launch} platform={platform} initialTrades={trades.trades} initialCandles={candles} renderedAt={Date.now()} />

      <section className={styles.panels}>
        <dl className={styles.facts}>
          <div>
            <dt>Creator fee</dt>
            <dd>
              {platform.creatorFeeBps / 100}% of every trade until graduation
              <span className={styles.verified}>Paid by the chain</span>
            </dd>
          </div>
          <div>
            <dt>Launched</dt>
            <dd>
              <time dateTime={launch.createdAt}>
                {`${new Date(launch.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`}
              </time>
            </dd>
          </div>
        </dl>

        <dl className={styles.addresses}>
          {(
            [
              ["Creator", launch.creator, "address"],
              ["Coin", launch.mint, "address"],
              ["Curve", launch.pool, "address"],
              ["Launch transaction", launch.createdSignature, "tx"],
            ] as const
          ).map(([label, value, kind]) => (
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
      </section>

      <Link href="/" className={styles.back}>All coins</Link>
    </article>
  );
}
