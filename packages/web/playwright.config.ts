import {defineConfig, devices} from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  globalSetup: "./tests/e2e/harness/global-setup.ts",
  outputDir: "./tests/e2e/results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A retry hides flakiness; a behavior test that needs one is broken.
  retries: 0,
  workers: process.env.CI ? 2 : "50%",
  timeout: 30_000,
  expect: {timeout: 10_000},
  reporter: process.env.CI
    ? [["github"], ["html", {open: "never", outputFolder: "./tests/e2e/report"}]]
    : [["list"], ["html", {open: "never", outputFolder: "./tests/e2e/report"}]],
  use: {
    ...devices["Desktop Chrome"],
    ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? {channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL} : {}),
    viewport: {height: 800, width: 1280},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
