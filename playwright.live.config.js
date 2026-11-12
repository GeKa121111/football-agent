import { defineConfig } from "@playwright/test";

const configuredBaseURL = process.env.FOOTBALL_AGENT_LIVE_URL;
if (!configuredBaseURL) {
  throw new Error("FOOTBALL_AGENT_LIVE_URL is required for the production smoke test.");
}
const parsedBaseURL = new URL(configuredBaseURL);
parsedBaseURL.pathname = parsedBaseURL.pathname.replace(/\\/+$/, "") + "/";
const baseURL = parsedBaseURL.toString();

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
