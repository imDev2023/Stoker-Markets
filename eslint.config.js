// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/.next*/",
      "**/.open-next/",
      "**/.wrangler/",
      "**/dist/",
      "**/next-env.d.ts",
      "**/test-results/",
      "**/playwright-report/",
      "research/",
      "spike/",
      "tools/localnet/.ledger/",
      ".claude/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The web app is a pure client of the API: transactions are built server-side only (ADR 0003), and the Raydium
    // SDK is GPL, so none of it may reach the browser bundle.
    files: ["apps/web/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@launchpad/chain", "@launchpad/chain/*"], message: "Transactions are built by the API (ADR 0003); the web app calls it." },
            { group: ["@raydium-io/*"], message: "The Raydium SDK is GPL and server-only (ADR 0003)." },
            { group: ["@coral-xyz/anchor", "@coral-xyz/anchor/*"], message: "Instruction building is server-only (ADR 0003)." },
          ],
        },
      ],
    },
  },
);
