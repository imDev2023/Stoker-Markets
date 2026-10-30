import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { REWARD_TAX_RATES } from "@launchpad/contract";
import { getBurns, getPlatform } from "@/lib/api";
import { graduationFeeSol, pct } from "@/lib/fees";
import { formatUtc } from "@/lib/format";
import { JUPITER_REFERRAL, JUPITER_REFERRAL_FEE_BPS, JUPITER_REFERRAL_KEEP_BPS } from "@/lib/jupiterReferral";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Fees",
  description: "Every fee a visitor can pay on Stoker, who pays it, when, in what asset and who receives it, each figure read from the chain.",
};

type Row = { fee: string; amount: ReactNode; note?: ReactNode; pays: ReactNode; when: ReactNode; asset: ReactNode; receives: ReactNode };

/**
 * The Fees page (owner, 2026-10-30): the one place on the site that shows a fee figure. One table of every fee, each
 * with who pays it, when, in what asset and who receives it; every figure from `GET /v1/platform` (and the Burn's
 * shares from `GET /v1/burns`), never a constant, so a fee change shows here the moment the chain has it. Everywhere
 * else the site says what a fee is for and links here.
 */
export default async function FeesPage() {
  const [platform, burns] = await Promise.all([getPlatform(), getBurns().catch(() => null)]);
  const now = new Date().toISOString();
  const graduationFee = graduationFeeSol(platform);
  const raydiumKeeps = (platform.poolCreatorFeeBps * platform.poolCreatorFeeShareBps) / 10_000;
  const lpShare = (platform.raydiumFee.poolBps * platform.raydiumFee.poolLpShareBps) / 10_000;
  const referralToPlatform = (JUPITER_REFERRAL_FEE_BPS * (10_000 - JUPITER_REFERRAL_KEEP_BPS)) / 10_000;

  const rows: Row[] = [
    {
      fee: "Creating a coin",
      amount: "No platform fee",
      note: (
        <>
          Solana charges the launch transaction&apos;s network fee and the rent of the coin&apos;s accounts; the review on the launch form shows the
          figure. A First Buy pays a curve trade&apos;s fees like any trade, an Airdrop&apos;s transactions pay their own network fees and rent, and a
          Reward Launch costs nothing more to create.
        </>
      ),
      pays: "The Creator",
      when: "At launch",
      asset: "SOL",
      receives: "Solana (validators and rent)",
    },
    ...(graduationFee
      ? [{
          fee: "Graduation Fee",
          amount: <>{graduationFee}&apos;s worth, once</>,
          note: (
            <>
              Taken out of the Creator&apos;s earnings on the coin, never on top of them, from the next Creator Forward on until paid, and never more
              than the Creator is owed at the time. The worth is read at the Quote Registry&apos;s price when each part is taken, and each part
              is a <code>graduation_fee</code> entry on the Ledger against the graduation&apos;s transaction.
            </>
          ),
          pays: "The Creator, out of their Creator Earnings",
          when: "Once the coin graduates",
          asset: "The coin’s Quote Asset",
          receives: "The platform",
        } satisfies Row]
      : []),
    {
      fee: "Platform Fee on the curve",
      amount: `${pct(platform.platformFeeBps)} of every trade`,
      note: (
        <>
          Half of it, {pct(platform.creatorForward.curveBps)} of the trade, is forwarded to the coin&apos;s Creator as Creator Earnings
          (sent to their wallet, nothing to claim); the platform keeps the other half.
        </>
      ),
      pays: "The trader",
      when: "Every trade while the coin is on its curve",
      asset: "The coin’s Quote Asset",
      receives: "The platform, half of it forwarded to the Creator",
    },
    {
      fee: "Creator Fee on the curve",
      amount: `${pct(platform.creatorFeeBps)} of every trade`,
      note: <>LaunchLab&apos;s on-chain creator share, set per platform: {platform.creatorFeeBps === 0 ? "none on Stoker, so nothing is ever paid into a Creator’s LaunchLab vault; Creators are paid through Creator Earnings instead" : "paid into the Creator’s LaunchLab vault, on top of Creator Earnings"}.</>,
      pays: "The trader",
      when: "Every trade while the coin is on its curve",
      asset: "The coin’s Quote Asset",
      receives: "The Creator’s LaunchLab vault",
    },
    {
      fee: "Raydium’s curve fee",
      amount: `${pct(platform.raydiumFee.curveBps)} of every trade`,
      note: <>The LaunchLab program&apos;s own fee, set by Raydium on the Quote Asset&apos;s config.</>,
      pays: "The trader",
      when: "Every trade while the coin is on its curve",
      asset: "The coin’s Quote Asset",
      receives: "Raydium",
    },
    {
      fee: "Referral share",
      amount: `${pct(platform.referralShareBps)} of a referred trade`,
      note: (
        <>
          Only where the Quote Asset&apos;s Raydium config allows a share fee (SOL&apos;s does; most others, every tokenized stock among them, allow none);
          each asset&apos;s page says. Paid on-chain by the trade itself, and never on a pool trade.
        </>
      ),
      pays: "The trader",
      when: "A curve trade opened through a referral link",
      asset: "The coin’s Quote Asset",
      receives: "The referrer",
    },
    {
      fee: "Pool creator fee",
      amount: `${pct(platform.poolCreatorFeeBps)} of every trade`,
      note: (
        <>
          The platform is every graduated pool&apos;s creator and collects it. Raydium keeps {pct(platform.poolCreatorFeeShareBps)} of the fee
          ({pct(raydiumKeeps)} of the trade) at collection; half of what arrives, {pct(platform.creatorForward.poolBps)} of the trade, is forwarded to the
          coin&apos;s Creator as Creator Earnings.
        </>
      ),
      pays: "The trader",
      when: "Every trade after the coin has graduated to its Raydium pool",
      asset: "The asset going into the pool: the Quote Asset on a buy, the coin on a sell",
      receives: "The platform, half of what arrives forwarded to the Creator; Raydium keeps its share",
    },
    {
      fee: "Pool trade fee",
      amount: `${pct(platform.raydiumFee.poolBps)} of every trade`,
      note: (
        <>
          Raydium&apos;s CPMM fee. {pct(platform.raydiumFee.poolLpShareBps)} of it ({pct(lpShare)} of the trade) belongs to the pool&apos;s liquidity
          providers; every graduated pool&apos;s liquidity is locked for good with the platform holding its Fee Key, so that part reaches the platform.
          Raydium keeps the rest.
        </>
      ),
      pays: "The trader",
      when: "Every trade after the coin has graduated to its Raydium pool",
      asset: "The asset going into the pool",
      receives: "The platform, through the Fee Key; Raydium keeps the rest",
    },
    {
      fee: "Reward Tax",
      amount: `${REWARD_TAX_RATES.map((bps) => pct(bps)).join(", ")} of every transfer`,
      note: (
        <>
          Only on a Reward Launch, at the rate its Creator fixed at launch, which nobody can change. Withheld by the coin itself on every
          transfer, trades included, and paid to the coin&apos;s holders in Reward Rounds, in the coin or in its Quote Asset as the Creator chose.
          See <Link href="/rewards">Holder rewards</Link>.
        </>
      ),
      pays: "Whoever sends the coin",
      when: "Every transfer of a Reward Launch’s coin",
      asset: "The coin",
      receives: "The coin’s holders",
    },
    {
      fee: "Buying with SOL a coin paired with another asset",
      amount: platform.solRoute ? "The swap’s own fee, if any; shown on the quote" : "Not offered on this deployment",
      note: (
        <>
          The buy swaps SOL into the Quote Asset first{platform.solRoute === "jupiter" ? " through Jupiter" : ""}, and spends only what the swap is sure to
          deliver: up to {pct(platform.solRouteToleranceBps)} under what the price gives now. What the swap delivers beyond that stays in the trader&apos;s
          wallet as the Quote Asset. The coin&apos;s own trade then pays the fees above.
        </>
      ),
      pays: "The trader",
      when: "A buy paid with SOL on a coin not paired with SOL",
      asset: "SOL",
      receives: platform.solRoute === "jupiter" ? "Jupiter and the pools it routes through" : "The route’s pools",
    },
    {
      fee: "Swapping any Solana token on the Swap page",
      amount: `${pct(JUPITER_REFERRAL_FEE_BPS)} of every swap`,
      note: (
        <>
          The Swap page is Jupiter&apos;s widget, and a swap made through it pays Jupiter&apos;s referral fee: Jupiter keeps a fifth of it
          ({pct(JUPITER_REFERRAL_FEE_BPS - referralToPlatform)} of the swap) and the platform receives the rest ({pct(referralToPlatform)} of the swap).
          {JUPITER_REFERRAL
            ? " It applies to every swap made on the Swap page."
            : " It applies once the platform’s referral account is set; until then the swap is Jupiter’s plain one and pays no referral fee."}{" "}
          Nothing of it is forwarded to a Creator: no coin is involved.
        </>
      ),
      pays: "The swapper",
      when: "Every swap made on the Swap page",
      asset: "The asset swapped",
      receives: "The platform, through Jupiter’s referral program; Jupiter keeps a fifth",
    },
    {
      fee: "Network fees and rent",
      amount: "Solana’s own",
      note: (
        <>
          Every transaction pays Solana&apos;s fee, and one that opens an account pays its rent (the first trade that names a Creator&apos;s LaunchLab
          vault opens it, and a trade in a new asset opens the wallet&apos;s account for it). Shown on every review before you sign.
        </>
      ),
      pays: "Whoever signs the transaction",
      when: "Every transaction",
      asset: "SOL",
      receives: "Solana",
    },
  ];

  return (
    <div className={`shell ${styles.page}`}>
      <h1 className={`t-h1 ${styles.title}`}>Fees</h1>
      <p className={styles.lead}>
        Every fee a visitor can pay on Stoker, in one place: who pays it, when, in what asset and who receives it. Each figure is read from
        the chain through the API as this page is opened, so what you see is what a transaction pays now. Half of what the platform collects
        on a coin&apos;s trades is its Creator&apos;s, and every payment is on the public <Link href="/revenue">Ledger</Link>.
      </p>
      <p className={styles.dated}>
        Figures as of <time dateTime={now}>{formatUtc(now)}</time>. A change to the Platform Fee or Creator Fee is announced ahead under{" "}
        <Link href="/announcements">Announcements</Link> and applied on-chain by the platform&apos;s admin.
      </p>

      <section className={`card ${styles.card}`} aria-labelledby="fees-title">
        <h2 id="fees-title" className="visually-hidden">Every fee</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Fee</th>
              <th scope="col">Who pays</th>
              <th scope="col">When</th>
              <th scope="col">In</th>
              <th scope="col">Who receives it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fee}>
                <th scope="row">
                  <span className={styles.feeName}>{r.fee}</span>
                  <span className={`mono ${styles.feeAmount}`}>{r.amount}</span>
                  {r.note && <span className={styles.feeNote}>{r.note}</span>}
                </th>
                <td data-label="Who pays">{r.pays}</td>
                <td data-label="When">{r.when}</td>
                <td data-label="In">{r.asset}</td>
                <td data-label="Who receives it">{r.receives}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="revenue-title">
        <h2 id="revenue-title" className={`t-h3 ${styles.cardTitle}`}>What the platform does with its share</h2>
        <ul className={styles.uses}>
          <li>
            <span>Forwarded to Creators</span>
            <span>Half of what it collects on each coin&apos;s trades, in the Quote Asset, within about an hour of collection; never swept.</span>
          </li>
          {burns && (
            <>
              <li>
                <span>The Burn</span>
                <span>{pct(burns.shares.burnBps)} of its own revenue buys the Platform Token on the market and burns it, on a public schedule.</span>
              </li>
              <li>
                <span>The Flywheel</span>
                <span>{pct(burns.shares.flywheelBps)} buys the {burns.shares.flywheelTopN} graduated coins with the most trading volume and burns them.</span>
              </li>
            </>
          )}
          <li>
            <span>Swept to the treasury</span>
            <span>The rest leaves the operations wallet for the treasury every hour; every move is on the Ledger with its transaction.</span>
          </li>
        </ul>
        <p className={styles.note}>
          The figures behind this are on <Link href="/revenue">Stats</Link>, and the API that serves them is documented under <Link href="/api">Developers</Link>.
        </p>
      </section>
    </div>
  );
}
