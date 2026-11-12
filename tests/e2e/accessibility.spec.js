import { test, expect } from "@playwright/test";

function luminance(color) {
  const value = color.trim();
  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  let channels;

  if (hexMatch) {
    let hex = hexMatch[1].slice(0, 6);
    if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join("");
    channels = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  } else {
    channels = value.match(/[0-9.]+/g)?.slice(0, 3).map(Number) ?? [];
  }

  if (channels.length !== 3) throw new Error("Unsupported computed color: " + color);
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe("Accessibility guardrails", () => {
  test("keeps Arabic document direction and named navigation landmarks", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "التنقل الرئيسي على سطح المكتب" })).toBeAttached();
    await expect(page.getByRole("navigation", { name: "التنقل الرئيسي على الهاتف" })).toBeAttached();
  });

  test("gives every visible button and form control an accessible name", async ({ page }) => {
    await page.goto("/");
    const buttons = await page.locator("#app button:visible").all();
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const label = await button.evaluate((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        const referencedText = labelledBy
          ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
          : "";
        return [
          element.getAttribute("aria-label"),
          referencedText,
          element.innerText,
          element.getAttribute("title")
        ].filter(Boolean).join(" ").trim();
      });
      expect(label, "Visible button must have an accessible name").not.toBe("");
    }

    const controls = await page.locator("#app input:visible, #app select:visible, #app textarea:visible").all();
    for (const control of controls) {
      const label = await control.evaluate((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        const referencedText = labelledBy
          ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
          : "";
        return [
          element.getAttribute("aria-label"),
          referencedText,
          [...(element.labels ?? [])].map((item) => item.textContent ?? "").join(" "),
          element.getAttribute("title")
        ].filter(Boolean).join(" ").trim();
      });
      expect(label, "Visible form control must have an accessible name").not.toBe("");
    }
  });

  test("keeps core design-token text combinations at WCAG AA contrast", async ({ page }) => {
    await page.goto("/");
    const palette = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      const read = (name) => styles.getPropertyValue(name).trim();
      return {
        backgrounds: ["--fa-bg", "--fa-bg-soft", "--fa-surface", "--fa-surface-raised"]
          .map((name) => [name, read(name)]),
        foregrounds: ["--fa-text", "--fa-text-soft", "--fa-muted", "--fa-accent"]
          .map((name) => [name, read(name)])
      };
    });

    for (const [foregroundName, foreground] of palette.foregrounds) {
      for (const [backgroundName, background] of palette.backgrounds) {
        const ratio = contrastRatio(foreground, background);
        expect(
          ratio,
          foregroundName + " on " + backgroundName + " must meet 4.5:1; actual " + ratio.toFixed(2)
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("does not render meaningful interface text below 10px", async ({ page }) => {
    await page.goto("/");
    const undersized = await page.locator("#app *").evaluateAll((elements) => elements
      .filter((element) => {
        if (element.children.length > 0 || !element.textContent?.trim()) return false;
        if (element.closest('[aria-hidden="true"]')) return false;
        const bounds = element.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return false;
        return Number.parseFloat(getComputedStyle(element).fontSize) < 10;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        text: element.textContent.trim().slice(0, 45),
        fontSize: getComputedStyle(element).fontSize
      })));
    expect(undersized).toEqual([]);
  });

  test("moves keyboard focus through the skip link to the main workspace", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.locator(".rebuild-skip-link");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });
});
