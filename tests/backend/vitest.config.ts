import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/harness.ts"],
    testTimeout: 90_000,
    hookTimeout: 180_000,
    // One chain, one database and one API are shared by every test file, so files run one after another.
    fileParallelism: false,
  },
});
