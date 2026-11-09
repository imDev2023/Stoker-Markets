import { avatarHues, MARKS_PER_CANDLE, type MarkList, type MarkRole, type MentionMark, type TradeMark } from "@launchpad/contract";
import type { ChartLook } from "./chartTheme";
import type { Mark } from "./charting";
import { COIN_DECIMALS, formatPriceCompact, formatUnits, shortAddress } from "./format";

/**
 * The marks on a coin's chart (#160) as the library draws them: a circle per wallet, side and candle with the trader's
 * picture and a ring in the up colour for a buy and the down colour for a sell, and a circle per post on X with its
 * author's picture and a ring in the accent. The tooltip says who, what and at what market cap; a post's mark opens
 * the post on X when clicked.
 */

/** Which trades the chart marks: the key wallets' (the default), every trade, or none. */
export type TradeMarks = "key" | "all" | "none";
export type MarksShown = { trades: TradeMarks; mentions: boolean };

const ROLE_WORDS: Record<MarkRole, string> = {
  you: "your wallet",
  notable: "a known wallet",
  creator: "the Creator",
  sniper: "a sniper",
  holder: "a top holder",
};

/** What a mark is about, for a click: a post on X opens on X. */
export type MarkTarget = { kind: "mention"; url: string } | { kind: "trade"; signature: string };

type Context = {
  symbol: string;
  /** The Quote Asset's ticker and decimals: what a trade paid or received. */
  quote: string;
  quoteDecimals: number;
  /** The unit market caps read in, and what one whole Quote Asset is worth in it (1 for the Quote Asset itself). */
  unit: string;
  perQuote: number;
  look: ChartLook;
};

const MARK_SIZE = 18;

/**
 * A wallet's generated avatar as an inline picture, the same two hues the API's `/avatars/wallet/` draws: the library
 * fetches a mark's picture again as it redraws, and a page of marks would otherwise never stop fetching.
 */
function walletPicture(wallet: string) {
  const [a, b] = avatarHues(wallet);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 70% 56%)"/><stop offset="1" stop-color="hsl(${b} 72% 38%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const TEXT_MAX = 160;

const compactNumber = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });

function capText(cap: number | null, ctx: Context) {
  if (cap === null) return null;
  const value = cap * ctx.perQuote;
  return `${value >= 1000 ? compactNumber(value) : formatPriceCompact(value)} ${ctx.unit}`;
}

/**
 * The tooltips are sentences: the library sets a mark's text as plain text (so a post's own words can never become
 * markup in our frame) and runs its lines together.
 */
function tradeText(m: TradeMark, ctx: Context) {
  const who = m.roles.includes("you") ? "You" : m.x ? `@${m.x.handle}` : shortAddress(m.wallet);
  const coins = compactNumber(Number(m.baseAmount) / 10 ** COIN_DECIMALS);
  const paid = formatUnits(m.quoteAmount, ctx.quoteDecimals, 4);
  const cap = capText(m.marketCap, ctx);
  let text = `${who} ${m.side === "buy" ? "bought" : "sold"} ${coins} ${ctx.symbol} for ${paid} ${ctx.quote}${cap ? `, leaving the market cap at ${cap}` : ""}.`;
  const roles = m.roles.filter((r) => r !== "you").map((r) => ROLE_WORDS[r]);
  if (roles.length) {
    const said = roles.join(" and ");
    text += ` ${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
  }
  if (m.trades > 1) text += ` ${m.trades} trades in this candle.`;
  return text;
}

/**
 * A word too long for the tooltip's width (a mint address, a link) runs out of its box and over the mark itself, where it
 * takes the click meant for the mark: such a word is shortened the way the site shortens an address.
 */
const LONG_WORD = /\S{25,}/g;
const shortenWords = (text: string) => text.replace(LONG_WORD, (w) => `${w.slice(0, 4)}…${w.slice(-4)}`);

function mentionText(m: MentionMark, ctx: Context) {
  const short = shortenWords(m.text);
  const words = short.length > TEXT_MAX ? `${short.slice(0, TEXT_MAX - 1).trimEnd()}…` : short;
  const cap = capText(m.marketCap, ctx);
  return `@${m.author.handle} on X: “${words}”${cap ? ` Market cap then: ${cap}.` : ""} Click to open the post.`;
}

/** Draw order on a bar: your own trades, then posts, then the other key wallets, then the rest; ten at most. */
function rankOf(m: { kind: "trade"; mark: TradeMark } | { kind: "mention" }) {
  if (m.kind === "mention") return 1;
  if (m.mark.roles.includes("you")) return 0;
  return m.mark.roles.length ? 2 : 3;
}

export function toChartMarks(list: MarkList, shown: MarksShown, ctx: Context) {
  const targets = new Map<string, MarkTarget>();
  const byBar = new Map<number, { rank: number; mark: Mark }[]>();
  const add = (time: number, rank: number, mark: Mark) => byBar.set(time, [...(byBar.get(time) ?? []), { rank, mark }]);
  const { look } = ctx;

  if (shown.trades !== "none")
    for (const m of list.trades) {
      const id = `t:${m.time}:${m.wallet}:${m.side}`;
      targets.set(id, { kind: "trade", signature: m.signature });
      add(m.time, rankOf({ kind: "trade", mark: m }), {
        id,
        time: m.time,
        color: { border: m.side === "buy" ? look.up : look.down, background: look.surface2 },
        text: tradeText(m, ctx),
        label: m.side === "buy" ? "B" : "S",
        labelFontColor: look.ink,
        minSize: MARK_SIZE,
        borderWidth: 2,
        hoveredBorderWidth: 3,
        imageUrl: m.x?.avatarUrl ?? walletPicture(m.wallet),
      });
    }
  if (shown.mentions)
    for (const m of list.mentions) {
      const id = `x:${m.id}`;
      targets.set(id, { kind: "mention", url: m.url });
      add(m.time, rankOf({ kind: "mention" }), {
        id,
        time: m.time,
        color: { border: look.accent, background: look.surface2 },
        text: mentionText(m, ctx),
        label: m.author.handle.charAt(0).toUpperCase(),
        labelFontColor: look.ink,
        minSize: MARK_SIZE,
        borderWidth: 2,
        hoveredBorderWidth: 3,
        ...(m.author.avatarUrl ? { imageUrl: m.author.avatarUrl } : {}),
      });
    }

  const marks = [...byBar.values()].flatMap((bar) =>
    bar
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MARKS_PER_CANDLE)
      .map((b) => b.mark),
  );
  return { marks, targets };
}
