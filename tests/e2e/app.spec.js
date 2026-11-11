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
    await expect(portraits).toHaveCount(16);

    const profiles = await portraits.evaluateAll((elements) => elements.map((element) => ({
      hair: element.dataset.hairStyle,
      face: element.dataset.faceShape,
      beard: element.dataset.facialHair,
      kit: element.dataset.kitPattern,
      paths: element.querySelectorAll("svg path").length
    })));
    expect(new Set(profiles.map((profile) => profile.face)).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.hair)).size).toBeGreaterThanOrEqual(4);
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
    await expect(page.locator(".player-card")).toHaveCount(16);
    await hasNoHorizontalOverflow(page);
  });

  test("filters scouting candidates and persists the watchlist", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");
    const roleFilter = page.getByLabel("تصفية حسب المركز");
    await roleFilter.selectOption("هجوم");
    await expect(page.locator(".player-card")).toHaveCount(2);
    await roleFilter.selectOption("حراسة");
    await expect(page.locator(".player-card")).toHaveCount(2);
    await roleFilter.selectOption("all");

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


  test("advances seven days sequentially and persists deadlines and season rollover", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-save-button").click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      save.world.currentDate = "2027-06-27";
      save.world.events = [];
      save.world.inbox = [];
      save.world.tasks = [{
        id: "task-week-skip-e2e",
        title: "مهمة تنتهي أثناء الأسبوع",
        description: "يجب تحويلها إلى متأخرة عند تجاوز موعدها.",
        createdDate: "2027-06-27",
        dueDate: "2027-06-28",
        category: "weekly-review",
        status: "open"
      }];
      save.career.day = 363;
      save.career.week = 52;
      save.career.season = 1;
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();

    await page.locator(".week-advance-button").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.currentDate).toBe("2027-07-04");
    expect(saved.career.day).toBe(370);
    expect(saved.career.week).toBe(53);
    expect(saved.career.season).toBe(2);
    expect(saved.world.tasks[0].status).toBe("overdue");
    expect(saved.world.tasks[0].overdueDate).toBe("2027-06-29");
    expect(saved.world.events.some((event) => event.type === "weekly-briefing" && event.date === "2027-06-28")).toBe(true);
    expect(saved.world.events.some((event) => event.type === "season-opening" && event.date === "2027-07-01")).toBe(true);
    expect(saved.world.inbox.every((message) => saved.world.events.some((event) => event.id === message.eventId))).toBe(true);
    await expect(page.locator(".toast-message")).toContainText("7 أيام");
    await page.reload();
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(restored.world.currentDate).toBe("2027-07-04");
    expect(restored.world.tasks[0].status).toBe("overdue");
    await hasNoHorizontalOverflow(page);
  });

  test("migrates a legacy save and persists weekly events, inbox and task actions", async ({ page }) => {
    await page.goto("/");
    const legacySave = {
      meta: { version: 1, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
      career: { day: 5, week: 1, season: 1 },
      agency: { id: "agency-player", name: "وكالة محفوظة", balance: 543210, reputation: 12, clients: ["client-existing"] },
      world: { currentDate: "2026-07-05", players: [], clubs: [], competitions: [], activeOffers: [] }
    };
    await page.evaluate((save) => {
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    }, legacySave);
    await page.reload();

    const untouchedLegacy = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(untouchedLegacy.meta.version).toBe(1);
    await expect(page.locator(".agent-name")).toHaveText("وكالة محفوظة");

    await page.locator(".day-advance-button").click();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.meta.version).toBe(2);
    expect(saved.career.day).toBe(6);
    expect(saved.career.week).toBe(1);
    expect(saved.career.season).toBe(1);
    expect(saved.agency.balance).toBe(543210);
    expect(saved.agency.clients).toEqual(["client-existing"]);
    expect(saved.world.currentDate).toBe("2026-07-06");
    expect(saved.world.events[0].type).toBe("weekly-briefing");
    expect(saved.world.inbox[0].eventId).toBe(saved.world.events[0].id);
    expect(saved.world.tasks[0].status).toBe("open");

    await expect(page.locator(".career-operations")).toBeVisible();
    await expect(page.getByText("الإحاطة الأسبوعية للوكالة").first()).toBeVisible();
    await page.locator(".task-complete-button").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.tasks[0].status).toBe("completed");
    expect(saved.world.tasks[0].completedDate).toBe("2026-07-06");

    await page.locator(".message-read-button").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.inbox[0].read).toBe(true);
    await page.reload();
    await expect(page.locator(".career-operations")).toBeVisible();
    await expect(page.getByText("تمت القراءة")).toBeVisible();
    await hasNoHorizontalOverflow(page);
  });


  test("rolls the season over on July 1 and updates the season header", async ({ page }) => {
    await page.goto("/");
    const legacySave = {
      meta: { version: 1, createdAt: "2027-06-30T00:00:00.000Z", updatedAt: "2027-06-30T00:00:00.000Z" },
      career: { day: 365, week: 53, season: 1 },
      agency: { id: "agency-player", name: "وكالتك الجديدة", balance: 100000, reputation: 1, clients: [] },
      world: { currentDate: "2027-06-30", players: [], clubs: [], competitions: [], activeOffers: [] }
    };
    await page.evaluate((save) => localStorage.setItem("football-agent.save", JSON.stringify(save)), legacySave);
    await page.reload();
    await expect(page.locator(".season-pill")).toHaveText("موسم 2026 / 2027");

    await page.locator(".day-advance-button").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.currentDate).toBe("2027-07-01");
    expect(saved.career.season).toBe(2);
    await expect(page.locator(".career-season")).toHaveText("الموسم ٢");
    await expect(page.locator(".season-pill")).toHaveText("موسم 2027 / 2028");
    expect(saved.world.events.some((event) => event.type === "season-opening")).toBe(true);
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


test.describe("Career operations follow-up", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("marks a task overdue, keeps it actionable and persists late completion", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-save-button").click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      save.world.tasks = [{
        id: "task-overdue-browser-test",
        title: "مهمة اختبار متأخرة",
        description: "اختبار انتقال المهمة من مفتوحة إلى متأخرة.",
        createdDate: save.world.currentDate,
        dueDate: save.world.currentDate,
        category: "weekly-review",
        status: "open"
      }];
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();
    await page.locator(".day-advance-button").click();

    const overdueTask = page.locator(".career-task-row.is-overdue");
    await expect(overdueTask).toBeVisible();
    await expect(overdueTask).toContainText("متأخرة منذ");
    await overdueTask.getByRole("button", { name: "إنجاز" }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.tasks[0].status).toBe("completed");
    expect(saved.world.tasks[0].completedLate).toBe(true);
  });

  test("searches and filters the event history", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-save-button").click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      save.world.currentDate = "2026-07-05";
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();
    await page.locator(".day-advance-button").click();
    await page.getByRole("button", { name: "عرض السجل الكامل" }).click();
    const dialog = page.getByRole("dialog", { name: "سجل الأحداث" });
    await expect(dialog).toBeVisible();

    const search = dialog.getByRole("searchbox", { name: "البحث في سجل الأحداث" });
    await search.fill("الإحاطة");
    await expect(dialog.locator(".event-history-row")).toHaveCount(1);
    await search.fill("مش موجود");
    await expect(dialog.getByText("مفيش أحداث مطابقة للبحث.")).toBeVisible();
    await search.clear();

    await dialog.getByLabel("تصفية نوع الحدث").selectOption("weekly-briefing");
    await expect(dialog.locator(".event-history-row")).toHaveCount(1);
  });
});


test.describe("Task history archive", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("searches and filters open, overdue and completed tasks on mobile", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-save-button").click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      save.world.tasks = [
        {
          id: "task-history-open",
          title: "مراجعة مفتوحة",
          description: "ملف ما زال قيد التنفيذ.",
          createdDate: "2026-07-01",
          dueDate: "2026-07-20",
          category: "weekly-review",
          status: "open"
        },
        {
          id: "task-history-overdue",
          title: "مهمة متأخرة",
          description: "تجاوزت تاريخ التسليم.",
          createdDate: "2026-07-01",
          dueDate: "2026-07-03",
          overdueDate: "2026-07-04",
          category: "weekly-review",
          status: "overdue"
        },
        {
          id: "task-history-completed",
          title: "تقرير مكتمل متأخر",
          description: "تم إنجازه بعد الموعد.",
          createdDate: "2026-07-01",
          dueDate: "2026-07-08",
          completedDate: "2026-07-09",
          completedLate: true,
          category: "season-review",
          status: "completed"
        }
      ];
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();
    await page.getByRole("button", { name: "سجل المهام" }).click();

    const dialog = page.getByRole("dialog", { name: "سجل المهام" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".task-history-row")).toHaveCount(3);

    const search = dialog.getByRole("searchbox", { name: "البحث في سجل المهام" });
    await search.fill("مكتمل متأخر");
    await expect(dialog.locator(".task-history-row")).toHaveCount(1);
    await expect(dialog.locator(".task-history-status")).toHaveText("مكتملة — متأخرًا");

    await search.clear();
    await dialog.getByLabel("تصفية حالة المهمة").selectOption("overdue");
    await expect(dialog.locator(".task-history-row")).toHaveCount(1);
    await expect(dialog.locator(".task-history-status")).toHaveText("متأخرة");

    await dialog.getByLabel("تصفية حالة المهمة").selectOption("completed");
    await expect(dialog.locator(".task-history-row")).toHaveCount(1);
    await expect(dialog.locator(".task-history-row .career-activity-copy small")).toContainText("أُنجزت متأخرًا");
    await hasNoHorizontalOverflow(page);
  });
});


test.describe("Annual career calendar", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("starts a new career with season-opening information", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-save-button").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.currentDate).toBe("2026-07-01");
    expect(saved.world.events.some((event) => event.type === "season-opening")).toBe(true);
    await expect(page.locator(".career-calendar-panel")).toBeVisible();
    await expect(page.getByText("انطلاق موسم جديد").first()).toBeVisible();
  });

  test("opens the next-year calendar and displays the season milestones", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-save-button").click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      save.world.currentDate = "2026-07-01";
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();

    await page.getByRole("button", { name: "عرض تقويم السنة القادمة" }).click();
    const dialog = page.getByRole("dialog", { name: "تقويم الوكالة — السنة القادمة" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("مراجعة جاهزية الموسم").first()).toBeVisible();
    await expect(dialog.getByText("مراجعة منتصف الموسم").first()).toBeVisible();
    await expect(dialog.getByText("تقييم نهاية الموسم").first()).toBeVisible();
    await expect(dialog.getByText("ختام الموسم").first()).toBeVisible();
    await hasNoHorizontalOverflow(page);
  });
});
