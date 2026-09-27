// Playwright global setup: start the whole system once (see @launchpad/stack), including the web app under `next dev`.
import { startStack } from "@launchpad/stack";

export default async function setup() {
  // The chain takes free ports by itself; TEST_RPC_PORT pins it when a fixed address helps debugging.
  const port = process.env.TEST_RPC_PORT;
  const { env, stop } = await startStack({ web: true, ...(port ? { rpcPort: Number(port) } : {}) });
  // Workers inherit the environment the global setup leaves behind.
  process.env.LAUNCHPAD_STACK = JSON.stringify(env);
  return stop;
}
