// Playwright global setup: start the whole system once (see @launchpad/stack), including the web app under `next dev`.
import { startStack } from "@launchpad/stack";

export default async function setup() {
  // The chain takes free ports by itself; TEST_RPC_PORT pins it when a fixed address helps debugging.
  const port = process.env.TEST_RPC_PORT;
  // Every seeded trade lands inside the Snipe Window, however long the seed takes, so the figures the shots show never move.
  // A Rebate Week (ADR 0021) lasts a minute, so `rewards.spec.ts` sees one traded, settled and paid, with room to read
  // the page while the week runs; no trade earns a rebate unless a Budget Table gives the `rebates` row a share, which
  // only that file announces, and it puts the first table back when it ends.
  // A Holding Day (ADR 0022) lasts three seconds, so `rewardsWeight.spec.ts` sees coins reach a step of the Holding
  // Weight: with the owner's steps, 7 days is 21 seconds and 30 days a minute and a half. Every run of the Reward Engine
  // on this stack therefore makes a Holding Check of every coin that can have a round, which writes Holding Lots and
  // nothing a page shows: no coin counts for more than once unless a rules version with steps is in force, which only
  // that file announces, and it puts the plain rules back when it ends.
  const { env, stop } = await startStack({ web: true, snipeWindowSlots: 100_000, rebateWeekSeconds: 60, holdingDaySeconds: 3, ...(port ? { rpcPort: Number(port) } : {}) });
  // Workers inherit the environment the global setup leaves behind.
  process.env.LAUNCHPAD_STACK = JSON.stringify(env);
  return stop;
}
