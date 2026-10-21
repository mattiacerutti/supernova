import {tmpdir} from "node:os";
import {join} from "node:path";
import {defineConfig, devices} from "@playwright/test";

// An in-browser server stepped frame by frame holds timing still enough to assert on single frames. Not run in CI.
const port = Number(process.env.PLAYWRIGHT_TIMELINE_PORT ?? 5174);
const outDir = join(tmpdir(), "supernova-timeline-client");

export default defineConfig({
  testDir: "./tests/timeline",
  outputDir: "./tests/timeline/results",
  fullyParallel: true,
  retries: 0,
  workers: 4,
  timeout: 60_000,
  expect: {timeout: 10_000},
  reporter: [["list"], ["html", {open: "never", outputFolder: "./tests/timeline/report"}]],
  use: {
    ...devices["Desktop Chrome"],
    ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? {channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL} : {}),
    baseURL: `http://127.0.0.1:${port}`,
    viewport: {height: 800, width: 1280},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `bunx vite build --mode timeline --outDir "${outDir}" --emptyOutDir && bunx vite preview --host 127.0.0.1 --port ${port} --strictPort --outDir "${outDir}"`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}`,
  },
});
