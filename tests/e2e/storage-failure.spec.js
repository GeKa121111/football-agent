import { test, expect } from "@playwright/test";

test("keeps the previous career when LocalStorage rejects a save", async ({ page }) => {
  await page.goto("/");
  await page.locator('button[aria-label="حفظ المسيرة"]').click();

  const before = await page.evaluate(() => localStorage.getItem("football-agent.save"));
  expect(before).toBeTruthy();

  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "football-agent.save") {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.locator(".day-advance-button").click();
  await expect(page.locator(".toast-message")).toContainText("تعذر الحفظ");

  const unchanged = await page.evaluate(() => localStorage.getItem("football-agent.save"));
  expect(unchanged).toBe(before);

  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
  expect(restored.career.day).toBe(1);
  expect(restored.world.currentDate).toBe("2026-07-01");
});
