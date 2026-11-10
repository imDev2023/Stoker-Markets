// Vitest global setup: start the whole backend once for every test file (see @launchpad/stack).
import type { TestProject } from "vitest/node";
import { startStack, type StackEnv } from "@launchpad/stack";

declare module "vitest" {
  export interface ProvidedContext {
    harness: StackEnv;
  }
}

export default async function setup(project: TestProject) {
  // The chain takes free ports by itself; TEST_RPC_PORT pins it when a fixed address helps debugging.
  // An Active Day of the Creator Ladder (ADR 0020) lasts ten seconds here, so `creator-ladder.test.ts` sees a coin climb;
  // the first ladder's fifteen days are still far more pool trading than any other file gives one coin.
  const { env, stop } = await startStack({ activeDaySeconds: 10, ...(process.env.TEST_RPC_PORT ? { rpcPort: Number(process.env.TEST_RPC_PORT) } : {}) });
  project.provide("harness", env);
  return stop;
}
