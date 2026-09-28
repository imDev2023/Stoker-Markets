import { listLaunches } from "@/lib/api";
import { Board } from "@/components/Board";
import { Hero } from "@/components/Hero";

export default async function HomePage() {
  const { launches } = await listLaunches();
  return (
    <>
      {/* The plate shows how a curve trade splits its fee, so it features the newest coin still on its curve. */}
      <Hero latest={launches.find((l) => l.curve.status === "live") ?? null} />
      <Board initial={launches} renderedAt={Date.now()} />
    </>
  );
}
