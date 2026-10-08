import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const config: NextConfig = {
  reactStrictMode: true,
  // Tests run their own `next dev` next to a developer's, each with its own build directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  transpilePackages: ["@launchpad/contract"],
  images: { unoptimized: true },
  // A Markdown file imports as its text: the API page renders `docs/api.md`, the one source of the reference (#37).
  turbopack: { rules: { "*.md": { loaders: [path.resolve(process.cwd(), "loaders/text.cjs")], as: "*.js" } } },
};

initOpenNextCloudflareForDev();
export default config;
