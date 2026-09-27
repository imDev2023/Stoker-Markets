import { listLaunches } from "@/lib/api";
import { Board } from "@/components/Board";
import { Hero } from "@/components/Hero";

export default async function HomePage() {
  const { launches } = await listLaunches();
  return (
    <>
      <Hero latest={launches[0] ?? null} />
      <Board initial={launches} />
    </>
  );
}
