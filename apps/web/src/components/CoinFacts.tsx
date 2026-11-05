"use client";

import Link from "next/link";
import type { LaunchSummary, LaunchTrust, PlatformInfo } from "@launchpad/contract";
import { explorerUrl, formatDuration, formatShare, formatUnits, formatUtc, quoteTicker, SOL_DECIMALS } from "@/lib/format";
import { LINK_KINDS, type LinkKind } from "@/lib/links";
import { Address } from "./Address";
import { CopyButton } from "./CopyButton";
import { LinkIcon, LinkName } from "./LinkIcon";
import styles from "./CoinFacts.module.css";

/**
 * The About block and the addresses, under the trade panel and the pair card (owner, 2026-10-31): the description, the
 * launch's details, what the Creator earns (in words: the Fees page is the one place a fee figure is shown, owner
 * 2026-10-30) and the Graduation Fee once there is one, the liquidity's state, the dates, the Copy Protection's length and end, the
 * coin's own links and the aggregators, then every address with its copy button. Drawn on the client from data like the
 * rest of the market: a server-rendered tree handed through the client boundary as a prop warned about missing keys on
 * the page with an Airdrop to send (2026-10-31), the same trap the pair card met.
 */
export function CoinFacts({ launch, platform, trust, renderedAt }: {
  launch: LaunchSummary;
  platform: PlatformInfo;
  /** Null until the API answered; the First Buy fact waits for it. */
  trust: LaunchTrust | null;
  /** The server's clock at render, so whether the window is over reads the same on the server and at hydration. */
  renderedAt: number;
}) {
  const quote = quoteTicker(launch.quote);
  const protectionOpen = new Date(launch.protection.until).getTime() <= renderedAt;
  // The window's length as well as its end: a short window ends the minute the coin launched, which read as the same date twice (owner, 2026-10-31).
  const protectionLength = formatDuration(new Date(launch.protection.until).getTime() - new Date(launch.createdAt).getTime());
  const addresses: (readonly [label: string, value: string, kind: "address" | "tx"])[] = [
    ["Creator", launch.creator, "address"],
    ["Coin", launch.mint, "address"],
    ["Curve", launch.pool, "address"],
    ["Launch transaction", launch.createdSignature, "tx"],
    ...(launch.graduation
      ? ([["Raydium pool", launch.graduation.pool, "address"], ["Graduation transaction", launch.graduation.signature, "tx"]] as const)
      : []),
  ];
  // The coin's own links, the seven kinds of the contract in the form's order with each network's mark (owner, 2026-11-02), where a visitor looks for them and where a coin without any says so; the aggregators, which know mainnet alone, after them (#41).
  const links = LINK_KINDS.map((k) => [k, launch.links[k]] as const).filter((l): l is readonly [LinkKind, string] => Boolean(l[1]));
  const elsewhere: [string, string][] = [
    ["DEX Screener", `https://dexscreener.com/solana/${launch.mint}`],
    ["Jupiter", `https://jup.ag/swap/${launch.quote.mint}-${launch.mint}`],
  ];
  const liquidity = launch.curve.status === "graduated"
    ? "Locked in its Raydium pool since graduation; its price is not."
    : launch.curve.status === "graduating"
      ? "The curve sold out; Raydium is moving the coin to its pool."
      : "On its bonding curve until the Graduation Target is raised; then locked in a Raydium pool.";

  return (
    <>
      <div className={`card ${styles.aboutCard}`}>
        <h2 className={`t-h3 ${styles.aboutTitle}`}>About {launch.symbol}</h2>
        {launch.description && <p className={styles.description}>{launch.description}</p>}
        <dl className={styles.facts}>
          <div>
            <dt>Launch type</dt>
            <dd>{launch.rewardTax ? "Reward Launch" : "Standard coin"}</dd>
          </div>
          {launch.rewardTax && (
            <div>
              <dt>Reward tax</dt>
              <dd>
                {launch.rewardTax.bps / 100}% of every transfer, paid out to holders in {launch.rewardTax.payout === "coin" ? launch.symbol : quote}
                {launch.rewardTax.locked ? (
                  <span>
                    Fixed for good:{" "}
                    <a href={explorerUrl("tx", launch.rewardTax.locked.signature, platform)} target="_blank" rel="noreferrer">
                      authority given up
                    </a>
                  </span>
                ) : (
                  <span>Fixed: LaunchLab holds the tax authority until graduation</span>
                )}
              </dd>
            </div>
          )}
          {trust && (
            <div>
              <dt>First Buy</dt>
              <dd>{trust.creator.firstBuy ? `${formatShare(trust.creator.firstBuy.share)} of the supply, bought by the Creator at launch` : "None: the Creator bought nothing at launch"}</dd>
            </div>
          )}
          <div>
            <dt>Creator earns</dt>
            <dd>
              Half of what the platform collects on this coin
              <span>Sent to the Creator&apos;s wallet with nothing to claim, on the curve and after graduation. <Link href="/fees">Every fee, explained</Link></span>
            </dd>
          </div>
          {launch.graduation?.fee && (
            <div>
              <dt>Graduation Fee</dt>
              <dd>
                {formatUnits(launch.graduation.fee.lamports, SOL_DECIMALS, 4)} SOL&apos;s worth
                <span>
                  {launch.graduation.fee.settledAt
                    ? `Withheld from the Creator's earnings in full: ${formatUnits(launch.graduation.fee.withheld, launch.quote.decimals, launch.quote.decimals)} ${quote}.`
                    : launch.graduation.fee.withheld === "0"
                      ? "Withheld from the Creator's next earnings, in the coin's Quote Asset, once something is collected for them."
                      : `${formatUnits(launch.graduation.fee.withheld, launch.quote.decimals, launch.quote.decimals)} ${quote} withheld from the Creator's earnings so far; the rest comes out of their next ones.`}
                </span>
              </dd>
            </div>
          )}
          <div>
            <dt>Liquidity</dt>
            <dd>{liquidity}</dd>
          </div>
          <div>
            <dt>Launched</dt>
            <dd>
              <time dateTime={launch.createdAt}>{formatUtc(launch.createdAt)}</time>
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
          <div>
            <dt>Copy protection</dt>
            {/* `data-until`: the suite sizes the time inside this sentence to the date's width for its mask. */}
            <dd data-until>
              {protectionLength} from launch
              <span>
                {protectionOpen ? "Ended " : "Until "}
                <time dateTime={launch.protection.until}>{formatUtc(launch.protection.until)}</time>
                {protectionOpen
                  ? ". Anyone may use this coin's name, ticker and image again."
                  : ": nobody else can launch a coin here with this name, ticker or image."}
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
          <div>
            <dt>Links</dt>
            <dd className={styles.elsewhere}>
              {links.length === 0 && <span>None given by the Creator.</span>}
              {links.map(([kind, href]) => (
                <a key={kind} href={href} className={`chip ${styles.social}`} target="_blank" rel="noreferrer nofollow">
                  <LinkIcon kind={kind} size={14} />
                  <LinkName kind={kind} />
                </a>
              ))}
            </dd>
          </div>
          <div>
            <dt>Elsewhere</dt>
            <dd className={styles.elsewhere}>
              {elsewhere.map(([label, href]) => (
                <a key={label} href={href} className="chip" target="_blank" rel="noreferrer">{label}</a>
              ))}
            </dd>
          </div>
        </dl>
      </div>

      <dl className={`card ${styles.addresses}`} aria-label="Addresses">
        {addresses.map(([label, value, kind]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Address value={value} kind={kind} platform={platform} />
              <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** How a coin took an earlier coin's identity, as the label's opening words. */
function copyKind(kind: "ticker" | "name" | "image" | "near") {
  return { ticker: "Its ticker is", name: "Its name is", image: "Its image is", near: "Its name or ticker is a near copy of" }[kind] + (kind === "near" ? "" : " that of");
}
