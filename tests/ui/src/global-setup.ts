// Playwright global setup: start the whole system once (see @launchpad/stack), including the web app under `next dev`.
import { startStack } from "@launchpad/stack";

export default async function setup() {
  // The chain takes free ports by itself; TEST_RPC_PORT pins it when a fixed address helps debugging.
  const port = process.env.TEST_RPC_PORT;
  // Every seeded trade lands inside the Snipe Window, however long the seed takes, so the figures the shots show never move.
  // A Rebate Week (ADR 0021) lasts a minute, so `rewards.spec.ts` sees one traded, settled and paid, with room to read
  // the page while the week runs; no trade earns a rebate unless a Budget Table gives the `rebates` row a share, which
  // only that file announces, and it puts the first table back when it ends.
  const { env, stop } = await startStack({ web: true, snipeWindowSlots: 100_000, rebateWeekSeconds: 60, ...(port ? { rpcPort: Number(port) } : {}) });
  // Workers inherit the environment the global setup leaves behind.
  process.env.LAUNCHPAD_STACK = JSON.stringify(env);
  return stop;
}
