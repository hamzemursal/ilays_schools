import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 3010;
const API_PORT = 4000;
const baseURL = `http://localhost:${WEB_PORT}`;

// reuseExistingServer means: if something's already listening on that port
// (your own `pnpm dev`, or a server this same config already started),
// don't start a second one. Works the same locally and in CI — CI just
// never has one already running, so Playwright starts both itself after
// the workflow's migrate+seed step.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // shared seeded fixtures (e.g. Hodan Ali) — tests
  // that mutate them (2FA enable/disable, duplicate-detection) shouldn't
  // race each other.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @school-erp/api dev",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      cwd: "../../",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter web dev",
      url: baseURL,
      cwd: "../../",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
