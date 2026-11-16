import Link from "next/link";
import type { ReactNode } from "react";
import { LIQUIDITY_LAUNCH, liquidityTaxBadge } from "@/lib/liquidityLaunch";
import { rewardSharesTail } from "@/lib/rewardBurn";
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
  /** A Reward Launch's Reward Burn (#183), basis points of every harvested tax; 0 for none. */
  rewardBurnBps: number;
  /** Its Reward Liquidity (#214), basis points of every harvested tax added to its pool; 0 for none. */
  rewardLiquidityBps: number;
  /** A Liquidity Launch's tax (#215), all of it added to its pool; null for any other coin, and then `rewardTaxBps` is null. */
  liquidityTaxBps: number | null;
};

/** The curve's line: how far along a live curve is, or where a finished one went. */
function curveWords(card: CoinCardData) {
  if (card.curve === "graduating") return "Sold out, graduating";
  if (card.curve === "graduated") return "Graduated, in its Raydium pool";
  const pct = card.progress;
  return `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}% of the way to graduation`;
}

/**
 * A Reward Launch's tag: its Reward Tax to holders and, with a Reward Burn or a Reward Liquidity, the share of it burned
 * or added to the pool, so the card says every mechanism (the owner's review of #213, #214): "5% to holders, half burned",
 * "5% to holders, a quarter burned, a quarter to liquidity".
 */
function rewardWords(card: CoinCardData) {
  return `${card.rewardTaxBps! / 100}% to holders${rewardSharesTail(card.rewardBurnBps, card.rewardLiquidityBps)}`;
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
      <div className={`${styles.row} ${styles.foot}`}>
        <span className={styles.meta}>{card.volume} traded today</span>
        {card.rewardTaxBps !== null && <span className={`tag tag-caution ${styles.reward}`}>{rewardWords(card)}</span>}
        {/* A Liquidity Launch's tag, in the same place and tone: a tax, by its own name, so nobody reads it as a reward. */}
        {card.liquidityTaxBps !== null && (
          <span className={`tag tag-caution ${styles.reward}`} title={LIQUIDITY_LAUNCH.line} data-liquidity-tax="">{liquidityTaxBadge(card.liquidityTaxBps)}</span>
        )}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={`card card-raised ${styles.card} ${styles.link}`}>{body}</Link>
  ) : (
    <div className={`card card-raised ${styles.card}`}>{body}</div>
  );
}
