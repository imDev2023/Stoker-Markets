import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { listLaunchQuotes, listLaunches } from "@/lib/api";
import { boardQueryFrom } from "@/lib/board";
import { Board } from "@/components/Board";

export const metadata: Metadata = pageMeta({
  path: "/coins",
  title: "Coins",
  description: "Every coin launched on Stoker, searched, sorted and filtered by what it is paired with.",
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The board: every coin, in the terminal look; the home page is the landing. */
export default async function CoinsPage({ searchParams }: Props) {
  const query = boardQueryFrom(await searchParams);
  const [board, quotes] = await Promise.all([listLaunches(query), listLaunchQuotes()]);
  return <Board initial={board.launches} initialQuery={query} quotes={quotes.quotes} renderedAt={Date.now()} />;
}
