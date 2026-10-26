import type { Metadata } from "next";
import Link from "next/link";
import { SITE_LINKS } from "@/lib/site";
import base from "../rewards/page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Curated",
  description: "Coins the platform has approved and works on, bought by the people who stake STOKER: the more a wallet stakes, the larger its allocation of each Curated launch.",
};

/**
 * Curated (owner, 2026-10-25, #118): the platform's own approved launches, open to STOKER stakers, each wallet's
 * allocation growing with its stake. Nothing to stake before STOKER launches, so the page says what Curated is and
 * where the first one will be announced.
 */
export default function CuratedPage() {
  return (
    <div className={`shell ${base.page}`}>
      <h1 className={`t-h1 ${base.title}`}>Curated</h1>
      <p className={base.lead}>
        A Curated launch is a coin the platform has approved and works on with its team. It is bought by the people who stake STOKER, the
        Platform Token: the more a wallet stakes, the larger its allocation of each Curated launch.
      </p>

      <section className={`card ${base.card}`} aria-labelledby="how-title">
        <h2 id="how-title" className={`t-h3 ${base.cardTitle}`}>How an allocation is earned</h2>
        <ol className={styles.steps}>
          <li>
            <strong>Stake STOKER.</strong> Only a wallet that has staked can buy a Curated launch.
          </li>
          <li>
            <strong>Your allocation follows your stake.</strong> Each Curated launch sets an amount aside for stakers, and the more STOKER a wallet
            has staked, the larger the share of it that wallet may buy.
          </li>
          <li>
            <strong>Every launch is approved first.</strong> The platform picks each Curated project and works on it; a coin anyone can stoke from
            the launch form is never a Curated launch.
          </li>
        </ol>
      </section>

      <section className={`card ${base.card}`} aria-labelledby="first-title">
        <h2 id="first-title" className={`t-h3 ${base.cardTitle}`}>No Curated launch yet</h2>
        <p className={base.note}>
          STOKER launches with the platform, and staking opens after it. The first Curated launch is announced here and on{" "}
          <a href={SITE_LINKS.x.href} target="_blank" rel="noreferrer">X</a> and{" "}
          <a href={SITE_LINKS.telegram.href} target="_blank" rel="noreferrer">Telegram</a>. Until then, every coin on the platform is on the board.
        </p>
        <Link href="/coins" className={`button button-ghost ${styles.action}`}>Explore the board</Link>
      </section>
    </div>
  );
}
