import Link from "next/link";
import type { ReactNode } from "react";
import { Change } from "./Change";
import { CoinImage } from "./CoinImage";
import { PairMark } from "./PairMark";
import { Price } from "./Price";
import styles from "./CoinCard.module.css";

/** What one coin's card shows, already in the card's terms: the landing's Trending reads it from a launch, the launch form's preview from the form. */
export type CoinCardData = {
  image: string | null;
  symbol: string;
  name: string;
  /** The Quote Asset's ticker. */
  quote: string;
  /** Price of one whole coin in the Quote Asset; null shows a dash. */
  price: number | null;
  change24h: number | null;
  /** How far the curve is toward its Graduation Target, 0 to 100. */
  progress: number;
  curve: "live" | "graduating" | "graduated";
  /** The day's volume, formatted. */
  volume: string;
  rewardTaxBps: number | null;
};

/** The curve's line: how far along a live curve is, or where a finished one went. */
function curveWords(card: CoinCardData) {
  if (card.curve === "graduating") return "Sold out, graduating";
  if (card.curve === "graduated") return "Graduated, in its Raydium pool";
  const pct = card.progress;
  return `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}% of the way to graduation`;
}

/**
 * One coin as a card (#133, after the research): the image with its fallback, the pair mark and the name, the price with
 * the day's change, the curve as the one thing drawn, and the day's volume; every card the same rows, so a grid of six
 * lines up. The pair is said once, by the mark. With `href` it is a link that lifts on hover (the landing's Trending);
 * without, the same card standing still (the launch form's preview, #172).
 */
export function CoinCard({ card, href }: { card: CoinCardData; href?: string }) {
  const body: ReactNode = (
    <>
      <div className={styles.top}>
        <CoinImage src={card.image} symbol={card.symbol} size={44} className={styles.image} />
        <div className={styles.titles}>
          <span className={styles.pairBox}><PairMark base={card.symbol} quote={card.quote} size="md" /></span>
          <span className={styles.name}>{card.name}</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={`t-figure ${styles.price}`}>{card.price === null ? "-" : <><Price value={card.price} /> {card.quote}</>}</span>
        <Change value={card.change24h} />
      </div>
      <div className={styles.curve}>
        <span className={styles.track} aria-hidden>
          <span className={styles.fill} style={{ width: `${card.progress}%` }} />
        </span>
        <span className={styles.meta}>{curveWords(card)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.meta}>{card.volume} traded today</span>
        {card.rewardTaxBps !== null && <span className="tag tag-caution">{card.rewardTaxBps / 100}% to holders</span>}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={`card card-raised ${styles.card} ${styles.link}`}>{body}</Link>
  ) : (
    <div className={`card card-raised ${styles.card}`}>{body}</div>
  );
}
