import { listLaunchQuotes, listLaunches } from "@/lib/api";
import { boardQueryFrom } from "@/lib/board";
import { Board } from "@/components/Board";
import { Hero } from "@/components/Hero";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HomePage({ searchParams }: Props) {
  const query = boardQueryFrom(await searchParams);
  const [board, newest, quotes] = await Promise.all([
    listLaunches(query),
    // The hero's plate shows how a curve trade splits its fee, so it features the newest coin still on its curve, whatever
    // the board is sorted or filtered by.
    listLaunches({ status: "live", limit: 1 }),
    listLaunchQuotes(),
  ]);
  const latest = newest.launches[0] ?? null;
  return (
    <>
      <Hero latest={latest} />
      <Board initial={board.launches} initialQuery={query} quotes={quotes.quotes} renderedAt={Date.now()} />
    </>
  );
}
