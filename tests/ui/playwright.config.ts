import { defineConfig, devices, type Project } from "@playwright/test";

// The page is checked at the widths people use it at, in both colour schemes.
const LOOKS = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, colorScheme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, colorScheme: "dark" },
  { name: "phone-light", viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true, hasTouch: true },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true },
] as const;

const chrome = devices["Desktop Chrome"];

/**
 * One stack serves every project, so projects run in an order that keeps what each one sees deterministic:
 * the empty board first, then the behaviour flows (which launch and trade coins), then a fixed board is seeded, then the visuals.
 */
const projects: Project[] = [
  ...LOOKS.map((l) => ({ name: `empty-${l.name}`, testMatch: "empty.spec.ts", use: { ...chrome, ...l } })),
  { name: "flows", testMatch: /(flows|trading|pairing|graduation|board|launchModes|pay-with-sol|operator|labels|serverKey)\.spec\.ts/, dependencies: LOOKS.map((l) => `empty-${l.name}`), use: { ...chrome, ...LOOKS[0] } },
  { name: "seed", testMatch: "seed.setup.ts", dependencies: ["flows"] },
  ...LOOKS.map((l) => ({ name: `visual-${l.name}`, testMatch: "visual.spec.ts", dependencies: ["seed"], use: { ...chrome, ...l } })),
];

export default defineConfig({
  testDir: "./src",
  globalSetup: "./src/global-setup.ts",
  projects,
  // One chain and one database behind every test: run tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0, threshold: 0.1, animations: "disabled", caret: "hide", stylePath: "./src/screenshot.css" },
  },
  // Baselines are rendered per platform: fonts rasterise differently on macOS and Linux.
  snapshotPathTemplate: "{testDir}/../screenshots/{platform}/{projectName}/{arg}{ext}",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
