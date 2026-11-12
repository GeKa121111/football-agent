import { defineConfig } from "@playwright/test";

const baseURL = process.env.FOOTBALL_AGENT_LIVE_URL;
if (!baseURL) {
  throw new Error("FOOTBALL_AGENT_LIVE_URL is required for the production smoke test.");
}

export default defineConfig({
  testDir: "./tests/live",
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 2,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
