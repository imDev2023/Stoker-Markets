import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const config: NextConfig = {
  reactStrictMode: true,
  // Tests run their own `next dev` next to a developer's, each with its own build directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  transpilePackages: ["@launchpad/contract"],
  images: { unoptimized: true },
  // Every page's metadata goes in its <head> (#83): Next would otherwise stream it into the body for any visitor it
  // doesn't know as a crawler, and a link preview from a client not on its list (a chat app, a reader, a curl) would
  // find no card. Nothing is lost: each page's title and description come from the reads the page itself awaits.
  htmlLimitedBots: /.*/,
};

initOpenNextCloudflareForDev();
export default config;
