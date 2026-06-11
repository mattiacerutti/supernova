import {defineConfig, devices} from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

export default defineConfig({
  workers: 8,
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  outputDir: "./tests/e2e/test-results",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? {channel: browserChannel} : {}),
      },
    },
  ],
  reporter: [["html", {open: "never", outputFolder: "./tests/e2e/playwright-report"}], ["line"]],
  testDir: "./tests/e2e/specs",
  timeout: 30_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
    env: {VITE_SUPERNOVA_E2E: "1"},
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
});
