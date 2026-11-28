import { test, expect } from "@playwright/test";

test("shows the first-run tour, completes all steps, and remembers completion", async ({ page }) => {
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "شرح بداية اللعبة" });
  await expect(dialog).toBeVisible();

  const headings = [
    "أهلًا بك في Football Agent",
    "اكتشف المواهب",
    "وقّع واعرض",
    "أدر الوكالة",
    "احفظ تقدمك"
  ];

  for (const heading of headings) {
    await expect(dialog.locator("h2")).toHaveText(heading);
    await dialog.getByRole("button").first().click();
  }

  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "شرح بداية اللعبة" })).toHaveCount(0);
});
