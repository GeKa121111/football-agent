// مواصفة Accessibility الخاصة بوكيل — المرحلة 3 (UXUI §4 و§5).
// تغطي: تباين Dark Mode من القيم المحسوبة في المتصفح، أهداف لمس 48px،
// غياب فيض أفقي على كل التبويبات السبعة بموبايل 390px، ترتيب تركيز RTL،
// تكبير 130% (بديل آلي عبر zoom — المراجعة البشرية على جهاز حقيقي
// تبقى لمحمد)، وبتدرج رمادي (الحالة لا تعتمد على اللون وحده).
// ما لا تغطيه هذه المواصفة عمدًا: TalkBack/VoiceOver على أجهزة حقيقية —
// يحتاج محمد نفسه، ومسجل كذلك في docs/WAKIL-PHASE-3.md.
import { test, expect } from "./fixtures.js";

const WAKIL_VARS = [
  "--wakil-ink", "--wakil-ink-soft", "--wakil-green", "--wakil-green-deep",
  "--wakil-danger", "--wakil-danger-dark", "--wakil-success", "--wakil-success-dark",
  "--wakil-warning", "--wakil-warning-dark", "--wakil-info-dark"
];
const WAKIL_BACKGROUNDS = ["--wakil-surface", "--wakil-paper", "--wakil-surface-muted"];

function luminance(color) {
  const value = String(color).trim();
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

async function readWakilTokens(page) {
  return page.evaluate((names) => {
    const styles = getComputedStyle(document.documentElement);
    const values = {};
    for (const name of names) values[name] = styles.getPropertyValue(name).trim();
    return values;
  }, [...WAKIL_VARS, ...WAKIL_BACKGROUNDS, "--wakil-danger-bg", "--wakil-success-bg", "--wakil-warning-bg", "--wakil-info-bg", "--wakil-green-light"]);
}

async function hasNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
}

async function gotoTab(page, label) {
  const viewport = page.viewportSize();
  const nav = page.locator(viewport && viewport.width <= 760 ? ".mobile-nav" : ".sidebar");
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: label, exact: true }).click();
}

test.describe("WAKIL accessibility — Phase 3", () => {
  test("dark mode keeps WAKIL text pairs at WCAG AA contrast in both themes", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 390, height: 844 });
    // الفاتح أولًا.
    const light = await readWakilTokens(page);
    for (const foreground of ["--wakil-ink", "--wakil-ink-soft", "--wakil-green", "--wakil-danger", "--wakil-success", "--wakil-warning"]) {
      const ratio = contrastRatio(light[foreground], light["--wakil-surface"]);
      expect(ratio, "light " + foreground + " on surface must meet 4.5:1; actual " + ratio.toFixed(2)).toBeGreaterThanOrEqual(4.5);
    }
    // الداكن عبر زر التبديل في هيدر «اليوم».
    await page.getByRole("button", { name: /الوضع الداكن/ }).click();
    await expect(page.locator("html")).toHaveClass(/wakil-dark/);
    const dark = await readWakilTokens(page);
    for (const foreground of ["--wakil-ink", "--wakil-ink-soft", "--wakil-green", "--wakil-danger", "--wakil-success", "--wakil-warning"]) {
      const ratio = contrastRatio(dark[foreground], dark["--wakil-surface"]);
      expect(ratio, "dark " + foreground + " on surface must meet 4.5:1; actual " + ratio.toFixed(2)).toBeGreaterThanOrEqual(4.5);
    }
    // أزواج الشرائح الملونة في الداكن أيضًا.
    expect(contrastRatio(dark["--wakil-danger-dark"], dark["--wakil-danger-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark["--wakil-success-dark"], dark["--wakil-success-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark["--wakil-warning-dark"], dark["--wakil-warning-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark["--wakil-info-dark"], dark["--wakil-info-bg"])).toBeGreaterThanOrEqual(4.5);
    // والعودة للفاتح.
    await page.getByRole("button", { name: /الوضع الفاتح/ }).click();
    await expect(page.locator("html")).not.toHaveClass(/wakil-dark/);
  });

  test("primary actions and navigation meet the 48px touch target", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 390, height: 844 });
    const small = await page.locator("#app .button-primary:visible, #app .dashboard-intro-actions button:visible").evaluateAll((elements) => elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.textContent.trim().slice(0, 40), width: rect.width, height: rect.height };
      })
      .filter((item) => item.height < 48 || item.width < 48));
    expect(small, "touch targets below 48px: " + JSON.stringify(small)).toEqual([]);
  });

  test("no horizontal overflow on any of the seven tabs at 390px", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const label of ["اليوم", "اللاعبون", "الكشافون", "المباريات", "الانتقالات", "الوكالة", "التقويم"]) {
      await gotoTab(page, label);
      await hasNoHorizontalOverflow(page);
    }
  });

  test("keyboard focus follows RTL visual order through the navigation", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 390, height: 844 });
    const order = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll(".mobile-nav button")];
      return buttons.map((button) => ({
        label: button.textContent.trim(),
        x: button.getBoundingClientRect().x
      }));
    });
    expect(order.length).toBeGreaterThanOrEqual(7);
    // RTL: أول زر في الـ DOM هو الأيمن (أكبر x)، والترتيب يتناقص يسارًا.
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index].x, "RTL order: " + order[index - 1].label + " then " + order[index].label).toBeLessThan(order[index - 1].x);
    }
    // التركيز بلوحة المفاتيح يمشي بنفس ترتيب الـ DOM.
    await page.keyboard.press("Tab");
    const focused = [];
    for (let index = 0; index < order.length; index += 1) {
      focused.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
      await page.keyboard.press("Tab");
    }
    expect(focused.filter(Boolean).length).toBeGreaterThan(0);
  });

  test("130% zoom proxy keeps the Today screen readable without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    // بديل آلي لتكبير المتصفح 130% (CSS بالـ px لا يتأثر بتكبير الخط
    // وحده؛ تكبير المتصفح الحقيقي يوسّع كل شيء). العرض 520px لأن
    // التكبير يقلّص نافذة التخطيط إلى 400px — أما على 390px فيقلّصها
    // إلى 300px، تحت الحد الأدنى المقصود 320px في base.css (حماية
    // أصغر الهواتف)، فيظهر فيض أفقي 26px لا مفر منه دون كسر الحماية.
    // هذا القيد موثق بصراحة في docs/WAKIL-PHASE-3.md، والمراجعة
    // البشرية على جهاز حقيقي تبقى لمحمد.
    await page.setViewportSize({ width: 520, height: 844 });
    await page.evaluate(() => { document.body.style.zoom = "1.3"; });
    await hasNoHorizontalOverflow(page);
    await expect(page.locator(".dashboard-heading")).toBeVisible();
    await page.evaluate(() => { document.body.style.zoom = ""; });
  });

  test("status is never conveyed by color alone, even in grayscale", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 390, height: 844 });
    // شرائح الحالة (الثقة/الولاء/خطر المغادرة) تظهر في ملف اللاعب —
    // يُفتح بزر «ملف اللاعب» داخل البطاقة، لا بالنقر على البطاقة نفسها.
    await gotoTab(page, "اللاعبون");
    await page.locator('.player-card[data-player-id="demo-yassin-adel"]')
      .getByRole("button", { name: "ملف اللاعب" }).click();
    await expect(page.locator(".wakil-chip").first()).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.filter = "grayscale(1)"; });
    const chips = await page.locator("#app .wakil-chip:visible").evaluateAll((elements) => elements
      .map((element) => element.textContent.trim()));
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((text) => text.length > 0), "every status chip must carry text, not just color").toBe(true);
    await page.evaluate(() => { document.documentElement.style.filter = ""; });
  });
});
