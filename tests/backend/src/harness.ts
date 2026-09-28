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
  const { env, stop } = await startStack(process.env.TEST_RPC_PORT ? { rpcPort: Number(process.env.TEST_RPC_PORT) } : {});
  project.provide("harness", env);
  return stop;
}
