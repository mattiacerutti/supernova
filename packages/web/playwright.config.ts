import {tmpdir} from "node:os";
import {join} from "node:path";
import {defineConfig, devices} from "@playwright/test";

const timelinePort = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
const runtimePort = Number(process.env.PLAYWRIGHT_RUNTIME_PORT ?? 4318);
const timelineBaseURL = `http://127.0.0.1:${timelinePort}`;
const runtimeBaseURL = `http://127.0.0.1:${runtimePort}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const video = process.env.PLAYWRIGHT_VIDEO === "on" ? "on" : "retain-on-failure";
const e2eRoot = process.env.SUPERNOVA_E2E_ROOT ?? join(tmpdir(), "supernova-runtime-e2e");
const timelineClientDir = join(tmpdir(), "supernova-timeline-e2e-client");
process.env.SUPERNOVA_E2E_ROOT = e2eRoot;

const browser = {
  ...devices["Desktop Chrome"],
  ...(browserChannel ? {channel: browserChannel} : {}),
  viewport: {height: 800, width: 1280},
};

export default defineConfig({
  expect: {timeout: 10_000},
  forbidOnly: Boolean(process.env.CI),
  outputDir: "./tests/e2e/test-results",
  projects: [
    {
      fullyParallel: true,
      name: "timeline",
      testMatch: ["app/**/*.spec.ts", "timeline/**/*.spec.ts"],
      use: {...browser, baseURL: timelineBaseURL},
      workers: process.env.CI ? 2 : 4,
    },
    {
      fullyParallel: false,
      name: "runtime",
      testMatch: "runtime/**/*.spec.ts",
      use: {...browser, baseURL: runtimeBaseURL},
      workers: 1,
    },
  ],
  reporter: [["html", {open: "never", outputFolder: "./tests/e2e/playwright-report"}], ["line"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e/specs",
  timeout: 60_000,
  use: {
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video,
  },
  webServer: [
    {
      command: `rm -rf "${timelineClientDir}" && bunx vite build --mode e2e --outDir "${timelineClientDir}" --emptyOutDir && bunx vite preview --host 127.0.0.1 --port ${timelinePort} --strictPort --outDir "${timelineClientDir}"`,
      reuseExistingServer: false,
      timeout: 120_000,
      url: timelineBaseURL,
    },
    {
      command: 'rm -rf "$SUPERNOVA_E2E_ROOT" && bunx vite build --mode e2e-runtime && bun run --filter @supernova/server build:e2e && node ../../apps/server/dist/e2e-server.js',
      env: {
        ...process.env,
        PI_OFFLINE: "1",
        SUPERNOVA_E2E_ROOT: e2eRoot,
        SUPERNOVA_HOME: e2eRoot,
        SUPERNOVA_SERVER_PORT: String(runtimePort),
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${runtimeBaseURL}/health`,
    },
  ],
});
