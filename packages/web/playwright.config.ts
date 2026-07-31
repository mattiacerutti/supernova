import {defineConfig, devices} from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const video = process.env.PLAYWRIGHT_VIDEO === "on" ? "on" : "retain-on-failure";

export default defineConfig({
  expect: {
    timeout: 7_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: "./tests/e2e/test-results",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? {channel: browserChannel} : {}),
        viewport: {height: 800, width: 1280},
      },
    },
  ],
  reporter: [["html", {open: "never", outputFolder: "./tests/e2e/playwright-report"}], ["line"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e/specs",
  timeout: 45_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video,
  },
  webServer: {
    command: `bun run dev -- --mode e2e --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
  workers: process.env.CI ? 2 : 4,
});
