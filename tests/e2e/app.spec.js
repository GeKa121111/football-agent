import { test, expect } from "@playwright/test";

async function navigateTo(page, view) {
  const mobileNav = page.locator(".mobile-nav");
  const desktopNav = page.locator(".sidebar");
  const nav = await mobileNav.isVisible() ? mobileNav : desktopNav;
  await nav.locator("button").filter({ hasText: view }).click();
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

test.describe("Desktop experience", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("shows the dashboard reference and desktop navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".home-stadium")).toBeVisible();
    await expect(page.locator(".agent-profile-card")).toBeVisible();
    await expect(page.locator(".career-day-panel")).toBeVisible();
    await expect(page.locator(".home-menu-grid .home-tile")).toHaveCount(18);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await hasNoHorizontalOverflow(page);
  });

  test("navigates through all five primary screens", async ({ page }) => {
    await page.goto("/");
    const screens = [
      ["اللاعبون", "اللاعبون"],
      ["الكشافون", "الكشافون"],
      ["الانتقالات", "سوق الانتقالات"],
      ["الوكالة", "الوكالة"],
      ["الرئيسية", "وكالتك الجديدة"]
    ];

    for (const [navLabel, heading] of screens) {
      await navigateTo(page, navLabel);
      if (navLabel === "الرئيسية") {
        await expect(page.locator(".agent-name")).toHaveText(heading);
      } else {
        await expect(page.locator(".main-stage h1.page-title")).toHaveText(heading);
      }
      await expect(page.locator('.sidebar [aria-current="page"]')).toHaveCount(1);
    }
  });

  test("renders distinct SVG player portraits and reuses them in player details", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");

    const portraits = page.locator(".player-card .player-portrait");
    await expect(portraits).toHaveCount(4);

    const profiles = await portraits.evaluateAll((elements) => elements.map((element) => ({
      hair: element.dataset.hairStyle,
      face: element.dataset.faceShape,
      beard: element.dataset.facialHair,
      kit: element.dataset.kitPattern,
      paths: element.querySelectorAll("svg path").length
    })));
    expect(new Set(profiles.map((profile) => profile.face)).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.hair)).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.kit)).size).toBe(4);
    expect(profiles.every((profile) => profile.paths >= 10)).toBe(true);

    const animationName = await portraits.first().locator(".portrait-athlete").evaluate(
      (element) => getComputedStyle(element).animationName
    );
    expect(animationName).toBe("portrait-idle");

    await portraits.first().locator("xpath=ancestor::article").getByRole("button", { name: "ملف اللاعب" }).click();
    await expect(page.locator(".modal-player-art .portrait-svg")).toBeVisible();
    await expect(page.locator(".modal-player-art")).toHaveAttribute("aria-label", /ياسين عادل/);
    await expect(page.locator(".modal-player-art")).toHaveAttribute("data-hair-style", profiles[0].hair);
  });

  test("opens a player profile and restores focus after Escape", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");
    const trigger = page.locator(".player-card").first().getByRole("button", { name: "ملف اللاعب" });
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "ملف اللاعب" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toHaveText("ملف اللاعب");
    const labelledBy = await dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    await expect(dialog.locator("#" + labelledBy)).toHaveText("ملف اللاعب");

    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-overlay")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("opens a transfer preview and closes it by clicking outside", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الانتقالات");
    await page.locator(".market-card").first().getByRole("button", { name: "التفاصيل" }).click();
    await expect(page.getByRole("dialog", { name: "فرصة انتقال تجريبية" })).toBeVisible();
    await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".modal-overlay")).toHaveCount(0);
  });
});

test.describe("Mobile experience", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("respects the operating system reduced-motion preference", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await navigateTo(page, "اللاعبون");
    const athlete = page.locator(".player-portrait .portrait-athlete").first();
    await expect(athlete).toBeVisible();
    const animationName = await athlete.evaluate((element) => getComputedStyle(element).animationName);
    expect(animationName).toBe("none");
  });

  test("shows bottom navigation with no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".mobile-nav")).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".home-menu-grid .home-tile")).toHaveCount(18);
    await hasNoHorizontalOverflow(page);
  });

  test("keeps the layout inside a narrow 320px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    await hasNoHorizontalOverflow(page);
    await expect(page.locator(".mobile-nav")).toBeVisible();
  });

  test("filters players and provides a useful empty state with reset", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");
    const search = page.getByRole("searchbox", { name: "البحث عن لاعب" });

    await search.fill("ياسين");
    await expect(page.locator(".player-card")).toHaveCount(1);
    await search.fill("اسم غير موجود");
    await expect(page.locator(".empty-results")).toBeVisible();
    await expect(page.getByText("مفيش لاعبين مطابقين للبحث")).toBeVisible();

    await page.getByRole("button", { name: "مسح البحث" }).click();
    await expect(page.locator(".player-card")).toHaveCount(4);
    await hasNoHorizontalOverflow(page);
  });

  test("filters scouting candidates and persists the watchlist", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");
    await page.getByLabel("تصفية حسب المركز").selectOption("هجوم");
    await expect(page.locator(".player-card")).toHaveCount(2);

    await page.getByRole("searchbox", { name: "البحث في المواهب" }).fill("ياسين");
    await expect(page.locator(".player-card")).toHaveCount(1);
    const follow = page.locator(".watch-button").first();
    await follow.click();
    await expect(follow).toHaveText(/في قائمة المتابعة/);
    await expect(follow).toBeDisabled();

    const savedIds = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.watchlist")));
    expect(savedIds).toContain("demo-yassin-adel");

    await page.reload();
    await navigateTo(page, "الكشافون");
    const restoredFollow = page.locator(".player-card").filter({ hasText: "ياسين عادل" }).locator(".watch-button");
    await expect(restoredFollow).toBeDisabled();
    await expect(restoredFollow).toHaveAttribute("aria-pressed", "true");
  });

  test("advances the career day and persists it across reloads", async ({ page }) => {
    await page.goto("/");
    await page.locator(".day-advance-button").click();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.career.day).toBe(2);
    expect(saved.career.week).toBe(1);
    expect(saved.world.currentDate).toBe("2026-07-02");

    await page.reload();
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(restored.career.day).toBe(2);
    expect(restored.world.currentDate).toBe("2026-07-02");
  });

  test("never overwrites a corrupt save when starting a new day", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("football-agent.save", "{broken json"));
    await page.reload();

    await expect(page.getByText(/ملف الحفظ الحالي غير صالح/)).toBeVisible();
    await page.locator(".day-advance-button").click();
    await expect(page.locator(".toast-message")).toContainText("ملف الحفظ غير صالح");
    const untouched = await page.evaluate(() => localStorage.getItem("football-agent.save"));
    expect(untouched).toBe("{broken json");
  });
});
