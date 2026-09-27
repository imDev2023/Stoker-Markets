// Vitest global setup: start the whole backend once for every test file (see @launchpad/stack).
import type { TestProject } from "vitest/node";
import { startStack, type StackEnv } from "@launchpad/stack";

declare module "vitest" {
  export interface ProvidedContext {
    harness: StackEnv;
  }
}

export default async function setup(project: TestProject) {
  // TEST_RPC_PORT lets several checkouts (worktrees) run their suites at the same time without port clashes.
  const { env, stop } = await startStack({ rpcPort: Number(process.env.TEST_RPC_PORT ?? 18_899) });
  project.provide("harness", env);
  return stop;
}
