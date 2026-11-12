import { test, expect } from "@playwright/test";

test("loads the mobile dashboard within a throttled 4G startup budget", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP network and CPU throttling is Chromium-specific.");
  await page.setViewportSize({ width: 390, height: 844 });

  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: "cellular4g"
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dashboard-intro")).toBeVisible();
  const elapsedMs = Date.now() - startedAt;

  const measurements = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      transferBytes: resources.reduce((total, resource) => total + (resource.transferSize || 0), 0),
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth
    };
  });

  expect(elapsedMs, "dashboard should become visible within 10 seconds on throttled 4G/4x CPU").toBeLessThan(10_000);
  expect(measurements.transferBytes, "initial transferred resources should stay below 700 KB").toBeLessThan(700_000);
  expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
  expect(measurements.domContentLoadedMs).toBeLessThan(10_000);
});
