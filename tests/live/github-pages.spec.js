import { test, expect } from "@playwright/test";

test("published GitHub Pages app boots, navigates and preserves a saved career", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response, "GitHub Pages must return a document response").not.toBeNull();
  expect(response.status(), "GitHub Pages must not return an HTTP error").toBeLessThan(400);
  await expect(page).toHaveTitle(/Football Agent/);
  await expect(page.locator(".rebuild-shell")).toBeVisible();
  await expect(page.locator("#main-content")).toBeVisible();

  await page.locator(".sidebar").getByRole("button", { name: "اللاعبون" }).click();
  await expect(page.locator(".main-stage h1.page-title")).toHaveText("قاعدة اللاعبين");

  await page.getByRole("button", { name: "حفظ المسيرة" }).click();
  const savedCareer = await page.evaluate(() => localStorage.getItem("football-agent.save"));
  expect(savedCareer, "save action must write a career to local storage").not.toBeNull();

  await page.reload({ waitUntil: "networkidle" });
  const restoredCareer = await page.evaluate(() => localStorage.getItem("football-agent.save"));
  expect(restoredCareer, "career must survive a full page reload").toBe(savedCareer);
  await expect(page.locator(".rebuild-shell")).toBeVisible();
  expect(pageErrors, "the published page must not throw uncaught JavaScript errors").toEqual([]);
});
