import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const config: NextConfig = {
  reactStrictMode: true,
  // Tests run their own `next dev` next to a developer's, each with its own build directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  transpilePackages: ["@launchpad/contract"],
  images: { unoptimized: true },
};

initOpenNextCloudflareForDev();
export default config;
