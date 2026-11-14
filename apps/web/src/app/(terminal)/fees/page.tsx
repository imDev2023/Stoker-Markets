import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BUDGET_ROWS, REWARD_BURN_SHARES, REWARD_TAX_RATES, TRADER_PROGRAMS_MAX_BPS, type BudgetRow } from "@launchpad/contract";
import { getBurns, getPlatform, getRebates } from "@/lib/api";
import { BUDGET_ROW_LABELS, budgetLine } from "@/lib/budget";
import { graduationFeeSol, pct } from "@/lib/fees";
import { formatDuration, formatUnits, formatUtc, SOL_DECIMALS } from "@/lib/format";
import { ladderLine, poolBpsAt, TIER_NAMES } from "@/lib/ladder";
import { isUtcWeek } from "@/lib/rebates";
import { JUPITER_REFERRAL, JUPITER_REFERRAL_FEE_BPS, JUPITER_REFERRAL_KEEP_BPS } from "@/lib/jupiterReferral";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Fees",
  description: "Every fee a visitor can pay on Stoker, who pays it, when, in what asset and who receives it, each figure read from the chain.",
};

type Row = { fee: string; amount: ReactNode; note?: ReactNode; pays: ReactNode; when: ReactNode; asset: ReactNode; receives: ReactNode };

/**
 * The Fees page (owner, 2026-10-30): the one place on the site that shows a fee figure. One table of every fee, each
 * with who pays it, when, in what asset and who receives it; every figure from `GET /v1/platform`, never a constant,
 * so a fee change shows here the moment the chain has it. Under it, the Creator Ladder (ADR 0020): the Creator's share
 * of a coin's fees by the coin's tier, and the Budget Table (ADR 0019): how what the platform keeps after the Creators'
 * share is divided; each as the version in force and any announced for later. The Volume Rebates' figures (ADR 0021)
 * are here too, from `GET /v1/rebates`: how long a Rebate Week is, the limit on a rebate and the minimum payout.
 * Everywhere else the site says what a fee is for and links here.
 */
/** The Reward Burn's shares other than none (#183), as the Reward Tax row says them: "10%, 25% or 50%". */
const burnShares = (() => {
  const shares = REWARD_BURN_SHARES.filter((bps) => bps > 0).map((bps) => pct(bps));
  return `${shares.slice(0, -1).join(", ")} or ${shares.at(-1)}`;
})();

export default async function FeesPage() {
  const [platform, burns, rebates] = await Promise.all([getPlatform(), getBurns().catch(() => null), getRebates().catch(() => null)]);
  const now = new Date().toISOString();
  const graduationFee = graduationFeeSol(platform);
  const raydiumKeeps = (platform.poolCreatorFeeBps * platform.poolCreatorFeeShareBps) / 10_000;
  const lpShare = (platform.raydiumFee.poolBps * platform.raydiumFee.poolLpShareBps) / 10_000;
  const referralToPlatform = (JUPITER_REFERRAL_FEE_BPS * (10_000 - JUPITER_REFERRAL_KEEP_BPS)) / 10_000;
  const shares = platform.budgetTable.inForce.shares;
  const ladder = platform.creatorForward.ladder;
  // What each tier is worth to a Creator: the first on either venue, the higher ones in the pool alone.
  const tierWorth = (tier: (typeof ladder.inForce.tiers)[number]) =>
    tier.tier === 1
      ? `From the coin’s launch: ${pct(platform.creatorForward.curveBps)} of every trade on the curve, and ${pct(poolBpsAt(platform, tier.shareBps))} of every trade in the pool after it graduates.`
      : `After ${tier.activeDays} Active Days: ${pct(poolBpsAt(platform, tier.shareBps))} of every trade in the pool.`;
  // A trader program's row has no share until the program is built (ADR 0019); the row says so rather than hiding.
  const program = (what: string, row: BudgetRow) => (shares[row] > 0 ? what : `${what} Not built yet, so nothing is set aside for it.`);
  // Volume Rebates are built (ADR 0021) and wait for their first share: until one is in force no trade earns one.
  const rebatesUse = "Paid back to traders in SOL after each Rebate Week, in proportion to the Platform Fees their trades paid.";
  const uses: Record<BudgetRow, string> = {
    burn: "Buys the Platform Token on the market and burns it, on a public schedule.",
    flywheel: `Buys the ${burns ? `${burns.shares.flywheelTopN} ` : ""}graduated coins with the most trading volume and burns them.`,
    rebates: shares.rebates > 0 ? rebatesUse : `${rebatesUse} Nothing is set aside yet: no trade earns a rebate until a share is announced.`,
    referrals: program("A referrer’s share on any pair, paid by the platform rather than by the trade.", "referrals"),
    integrators: program("For the apps and bots that bring trades through the API.", "integrators"),
    treasury: "The rest leaves the operations wallet for the treasury every hour; every move is on the Ledger with its transaction.",
  };

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
          (sent to their wallet with nothing to claim, unless they pointed it elsewhere at launch); the platform keeps the other half.
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
          coin&apos;s Creator as Creator Earnings, and more as the coin climbs the <a href="#creator-ladder">Creator Ladder</a>.
        </>
      ),
      pays: "The trader",
      when: "Every trade after the coin has graduated to its Raydium pool",
      asset: "The asset going into the pool: the Quote Asset on a buy, the coin on a sell",
      receives: "The platform, half or more of what arrives forwarded to the Creator; Raydium keeps its share",
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
          The Creator may also fix a Reward Burn at launch: {burnShares} of every harvested tax, burned before anything is sold or paid.
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
        on a coin&apos;s trades is its Creator&apos;s, more once the coin has graduated and keeps trading, and every payment is on the public{" "}
        <Link href="/revenue">Ledger</Link>.
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

      <section id="creator-ladder" className={`card ${styles.card}`} aria-labelledby="ladder-title">
        <h2 id="ladder-title" className={`t-h3 ${styles.cardTitle}`}>What a Creator earns: the Creator Ladder</h2>
        <p className={styles.words}>
          Every coin starts on the first tier: half of what the platform collects on its trades is its Creator&apos;s, on the curve and after
          it graduates. A graduated coin then climbs by its Active Days, the days (UTC) on which its pool traded at least{" "}
          {pct(ladder.inForce.activeDayFloorBps)} of the coin&apos;s own Graduation Target. A higher tier raises the Creator&apos;s share of the
          pool creator fee collected from then on, and a tier, once reached, is never lost.
        </p>
        <ul className={`${styles.uses} ${styles.budget}`} aria-label="The Creator's share by tier">
          {ladder.inForce.tiers.map((tier) => (
            <li key={tier.tier} data-tier={tier.tier}>
              <span>{TIER_NAMES[tier.tier]}</span>
              <span className={styles.share}>{pct(tier.shareBps)}</span>
              <span>{tierWorth(tier)}</span>
            </li>
          ))}
        </ul>
        {ladder.upcoming.map((next) => (
          <p key={next.version} className={styles.upcoming} data-upcoming-ladder={next.version}>
            From <time dateTime={next.effectiveAt}>{formatUtc(next.effectiveAt)}</time>: {ladderLine(next)}.
            {next.note && <> {next.note}.</>} It applies to what is collected from then on, and a coin keeps every tier it has reached.
          </p>
        ))}
        <p className={styles.note}>
          Where that share goes is the Creator&apos;s choice on the launch form: their own wallet, or instead the coin&apos;s holders, a buyback
          that burns the coin, or liquidity locked in its pool. The choice is fixed at launch, and the share is the same wherever it goes.
        </p>
        <p className={styles.note}>
          A tier&apos;s share is of the pool creator fee that arrives, after Raydium&apos;s part; the Fee Key&apos;s part of a pool trade stays the
          platform&apos;s at every tier. A coin&apos;s Active Days are counted and its tier recorded before each hourly collection, and both are shown
          on its page; anyone can recount the days from its trades. A change to the ladder is announced at least a day ahead under{" "}
          <Link href="/announcements">Announcements</Link>.
        </p>
      </section>

      <section className={`card ${styles.card}`} aria-labelledby="revenue-title">
        <h2 id="revenue-title" className={`t-h3 ${styles.cardTitle}`}>What the platform does with its share</h2>
        <p className={styles.words}>
          The Creator&apos;s share of what the platform collects on each coin&apos;s trades is forwarded to that coin&apos;s Creator first, in the
          Quote Asset, within about an hour of collection. The Fee Key&apos;s part of a pool trade, {pct(lpShare)} of the trade, is the platform&apos;s alone:
          no Creator&apos;s share comes out of it. What is left is the platform&apos;s share, and one table divides all of it.
        </p>
        <ul className={`${styles.uses} ${styles.budget}`} aria-label="How the platform's share is divided">
          {BUDGET_ROWS.map((row) => (
            <li key={row} data-row={row} className={shares[row] === 0 ? styles.idle : undefined}>
              <span>{BUDGET_ROW_LABELS[row]}</span>
              <span className={styles.share}>{pct(shares[row])}</span>
              <span>{uses[row]}</span>
            </li>
          ))}
        </ul>
        {platform.budgetTable.upcoming.map((next) => (
          <p key={next.version} className={styles.upcoming} data-upcoming={next.version}>
            From <time dateTime={next.effectiveAt}>{formatUtc(next.effectiveAt)}</time>: {budgetLine(next.shares)}.
            {next.note && <> {next.note}.</>} It applies to what is collected from then on, never to what came before.
          </p>
        ))}
        {/* The Volume Rebates' own figures, each read from the API as the page is opened: the week, the limit and the minimum. */}
        <p id="volume-rebates" className={styles.words} data-rebates-terms>
          A Volume Rebate is counted over a Rebate Week
          {rebates && (isUtcWeek(rebates.program.weekSeconds)
            ? ", a UTC week from Monday 00:00 to the next Monday"
            : `, which lasts ${formatDuration(rebates.program.weekSeconds * 1000)} on this deployment`)}
          . Once the week has ended, what the Volume rebates row has left is split among the week&apos;s traders in proportion to the
          Platform Fees their trades paid, on a curve or in a pool, buys and sells alike. A rebate is paid in SOL and is never more than
          the row&apos;s own share of the fees the trader paid{shares.rebates > 0 && ` (${pct(shares.rebates)} of them now)`}; a trade made
          while the row has no share earns none. A wallet&apos;s rebates are sent in one transfer once together they reach{" "}
          {rebates ? `${formatUnits(rebates.program.minPayoutLamports, SOL_DECIMALS)} SOL` : "the minimum payout"}, each payment a{" "}
          <code>rebate</code> entry on the Ledger. Where the program stands, week by week, is on the{" "}
          <Link href="/rewards#volume-rebates">Rewards page</Link>.
        </p>
        <p className={styles.note}>
          The shares always sum to 100%, and a share applies only to what is collected while it is in force. A change to this table is
          announced at least a day ahead under <Link href="/announcements">Announcements</Link>. Once the trader programs start they take{" "}
          {pct(TRADER_PROGRAMS_MAX_BPS)} together at most, out of the Burn&apos;s share alone. The figures behind this are on{" "}
          <Link href="/revenue">Stats</Link>, and the API that serves them is documented under <Link href="/api">Developers</Link>.
        </p>
      </section>
    </div>
  );
}
