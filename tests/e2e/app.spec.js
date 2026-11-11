import { test, expect } from "@playwright/test";
import { advanceCareerDays } from "../../src/engines/career-calendar.js";
import { advanceRepresentationState } from "../../src/engines/representation.js";

async function navigateTo(page, view) {
  const mobileNav = page.locator(".mobile-nav");
  const desktopNav = page.locator(".sidebar");
  const nav = await mobileNav.isVisible() ? mobileNav : desktopNav;
  await nav.getByRole("button", { name: view, exact: true }).click();
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

function advanceSaveToDate(save, targetDate) {
  const current = Date.parse(save.world.currentDate + "T00:00:00.000Z");
  const target = Date.parse(targetDate + "T00:00:00.000Z");
  let days = Math.round((target - current) / 86400000);
  if (days < 0) throw new Error("Target date must not precede the saved career date.");
  let advanced = save;
  while (days > 0) {
    const step = Math.min(days, 31);
    advanced = advanceCareerDays(advanced, step);
    days -= step;
  }
  return advanceRepresentationState(advanced, targetDate).save;
}

test.describe("Desktop experience", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("shows the dashboard reference and desktop navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".dashboard-intro")).toBeVisible();
    await expect(page.locator(".dashboard-agency-card")).toBeVisible();
    await expect(page.locator(".dashboard-day-card")).toBeVisible();
    await expect(page.locator(".dashboard-quick-action")).toHaveCount(3);
    await expect(page.locator(".home-menu-grid .home-tile")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await hasNoHorizontalOverflow(page);
  });
  
  test("keeps all five workspaces within every supported viewport width", async ({ page }) => {
    await page.goto("/");
    const viewports = [
      { width: 320, height: 800 },
      { width: 390, height: 844 },
      { width: 768, height: 900 },
      { width: 1440, height: 960 }
    ];
    const screens = ["اللاعبون", "الكشافون", "الانتقالات", "الوكالة", "الرئيسية"];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const screen of screens) {
        await navigateTo(page, screen);
        await expect(page.locator(".main-stage")).toBeVisible();
        await expect(page.locator(".main-stage")).toBeFocused();
        const navigation = viewport.width <= 760
          ? page.locator(".mobile-nav")
          : page.locator(".sidebar");
        await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        await hasNoHorizontalOverflow(page);
      }
    }
  });

  test("provides a keyboard skip link that moves focus to the main workspace", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.locator(".rebuild-skip-link");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".main-stage")).toBeFocused();
  });

  test("navigates through all five primary screens", async ({ page }) => {
    await page.goto("/");
    const screens = [
      ["اللاعبون", "قاعدة اللاعبين"],
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

  test("negotiates and signs a player representation contract", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await expect(page.locator(".representation-prospect-card")).toHaveCount(48);

    await page.locator(".representation-prospect-card").first().locator(".representation-offer-button").click();
    const modal = page.locator(".modal-overlay");
    await modal.getByLabel("نسبة العمولة").selectOption("15");
    await modal.getByLabel("مدة العقد").selectOption("1095");
    await modal.getByRole("button", { name: "إرسال عرض التمثيل" }).click();

    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.meta.version).toBe(4);
    expect(saved.agency.representation.offers).toHaveLength(1);
    expect(saved.agency.representation.offers[0].status).toBe("pending");
    expect(saved.agency.clients).toHaveLength(0);

    await page.locator(".representation-evaluate-button").click();
    await expect(page.locator(".representation-offer-row.is-countered")).toBeVisible();
    await expect(page.locator(".representation-accept-button")).toBeVisible();
    await page.locator(".representation-accept-button").click();

    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.agency.clients).toEqual([saved.agency.representation.contracts[0].playerId]);
    expect(saved.agency.representation.contracts).toHaveLength(1);
    expect(saved.agency.representation.contracts[0].status).toBe("active");
    expect(saved.agency.representation.contracts[0].commissionRate).toBeLessThan(15);
    expect(saved.agency.representation.history.map((entry) => entry.type)).toContain("contract-signed");
    await expect(page.locator(".representation-contract-row")).toBeVisible();

    const clientSearch = page.getByRole("searchbox", { name: "البحث في عملاء الوكالة" });
    await clientSearch.fill(saved.agency.representation.contracts[0].playerName.slice(0, 3));
    await expect(page.locator(".representation-contract-row")).toHaveCount(1);
    await clientSearch.fill("اسم غير موجود");
    await expect(page.locator(".empty-results")).toBeVisible();
    await page.getByRole("button", { name: "مسح البحث" }).click();
    await expect(page.locator(".representation-contract-row")).toHaveCount(1);

    await page.locator(".representation-terminate-button").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.agency.clients).toHaveLength(0);
    expect(saved.agency.representation.contracts[0].status).toBe("terminated");
    expect(saved.agency.representation.history[0].type).toBe("contract-terminated");
  });

  test("supports a second player counter and an agency counter before signing", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await page.locator(".representation-prospect-card").first().locator(".representation-offer-button").click();
    const offerModal = page.locator(".modal-overlay");
    await offerModal.getByLabel("نسبة العمولة").selectOption("15");
    await offerModal.getByLabel("مدة العقد").selectOption("1095");
    await offerModal.getByRole("button", { name: "إرسال عرض التمثيل" }).click();

    await page.locator(".representation-evaluate-button").click();
    await page.locator(".representation-counter-button").click();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    let offer = saved.agency.representation.offers[0];
    const counterModal = page.locator(".modal-overlay");
    await counterModal.getByLabel("نسبة العمولة في العرض المضاد").selectOption("15");
    await counterModal.getByLabel("مدة العرض المضاد").selectOption("1095");
    await counterModal.getByRole("button", { name: "إرسال العرض المضاد" }).click();

    await expect(page.locator(".representation-offer-row.is-countered")).toBeVisible();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    offer = saved.agency.representation.offers[0];
    expect(offer.round).toBe(3);
    expect(saved.agency.representation.history.some((entry) => entry.type === "agency-countered")).toBe(true);

    await page.locator(".representation-counter-button").click();
    const finalModal = page.locator(".modal-overlay");
    await finalModal.getByLabel("نسبة العمولة في العرض المضاد").selectOption(String(offer.playerPreferences.preferredCommissionRate + 1));
    await finalModal.getByLabel("مدة العرض المضاد").selectOption(String(offer.playerPreferences.preferredTermDays));
    await finalModal.getByRole("button", { name: "إرسال العرض المضاد" }).click();

    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.agency.representation.contracts).toHaveLength(1);
    expect(saved.agency.representation.contracts[0].status).toBe("active");
    expect(saved.agency.representation.offers[0].resolution).toBe("agency-countered");
    expect(saved.agency.clients).toContain(saved.agency.representation.contracts[0].playerId);
  });

  test("renews a player's contract in the final 90 days without replacing the original mandate", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await page.locator(".representation-prospect-card").first().locator(".representation-offer-button").click();
    const offerModal = page.locator(".modal-overlay");
    await offerModal.getByLabel("نسبة العمولة").selectOption("15");
    await offerModal.getByLabel("مدة العقد").selectOption("1095");
    await offerModal.getByRole("button", { name: "إرسال عرض التمثيل" }).click();
    await page.locator(".representation-evaluate-button").click();
    await page.locator(".representation-accept-button").click();

    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const original = saved.agency.representation.contracts[0];
    const targetDate = new Date(Date.parse(original.expiresOn + "T00:00:00.000Z") - 60 * 86400000)
      .toISOString().slice(0, 10);
    const nearExpirySave = advanceSaveToDate(saved, targetDate);
    await page.evaluate((snapshot) => {
      localStorage.setItem("football-agent.save", JSON.stringify(snapshot));
    }, nearExpirySave);
    await page.reload();
    await navigateTo(page, "الوكالة");
    await expect(page.locator(".representation-renew-button")).toBeVisible();
    await page.locator(".representation-renew-button").click();

    const renewalModal = page.locator(".modal-overlay");
    const preferences = original.playerPreferences;
    await renewalModal.getByLabel("عمولة التجديد").selectOption(String(preferences.preferredCommissionRate));
    await renewalModal.getByLabel("مدة التجديد").selectOption(String(preferences.preferredTermDays));
    await renewalModal.getByRole("button", { name: "إرسال عرض التجديد" }).click();

    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.agency.representation.offers[0].kind).toBe("renewal");
    await page.locator(".representation-evaluate-button").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const renewed = saved.agency.representation.contracts[0];
    expect(saved.agency.representation.contracts).toHaveLength(1);
    expect(renewed.id).toBe(original.id);
    expect(renewed.expiresOn).toBe(original.expiresOn);
    expect(renewed.renewals).toHaveLength(1);
    expect(renewed.renewals[0].startsOn).toBe(original.expiresOn);
    expect(Date.parse(renewed.renewals[0].expiresOn + "T00:00:00.000Z"))
      .toBeGreaterThan(Date.parse(original.expiresOn + "T00:00:00.000Z"));
    expect(saved.agency.clients).toContain(renewed.playerId);
    expect(saved.agency.representation.history.some((entry) => entry.type === "contract-renewed")).toBe(true);
  });

  test("manages player messages, scheduled meetings and relationship outcomes", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await page.locator(".representation-prospect-card").first().locator(".representation-offer-button").click();
    const offerModal = page.locator(".modal-overlay");
    await expect(offerModal.getByLabel("نوع التمثيل")).toBeVisible();
    await offerModal.getByLabel("نسبة العمولة").selectOption("15");
    await offerModal.getByLabel("مدة العقد").selectOption("1095");
    await offerModal.getByRole("button", { name: "إرسال عرض التمثيل" }).click();
    await page.locator(".representation-evaluate-button").click();
    await page.locator(".representation-accept-button").click();

    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const contract = saved.agency.representation.contracts[0];
    expect(["exclusive", "non-exclusive"]).toContain(contract.representationType);
    const startingTrust = contract.relationshipScore;
    const startingReputation = saved.agency.representation.reputationScore;

    await page.locator(".representation-message-button").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const message = saved.agency.representation.interactions[0];
    expect(message.kind).toBe("message");
    expect(message.status).toBe("pending_response");

    const afterReply = advanceSaveToDate(saved, message.dueDate);
    await page.evaluate((snapshot) => {
      localStorage.setItem("football-agent.save", JSON.stringify(snapshot));
    }, afterReply);
    await page.reload();
    await navigateTo(page, "الوكالة");
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const repliedMessage = saved.agency.representation.interactions.find((item) => item.id === message.id);
    expect(repliedMessage.status).toBe("resolved");
    expect(saved.agency.representation.history.some((entry) => entry.type === "message-replied")).toBe(true);
    expect(saved.agency.representation.contracts[0].relationshipScore).not.toBe(startingTrust);

    const currentDate = saved.world.currentDate;
    const meetingDate = new Date(Date.parse(currentDate + "T00:00:00.000Z") + 5 * 86400000)
      .toISOString().slice(0, 10);
    await page.locator(".representation-meeting-button").click();
    const meetingModal = page.locator(".modal-overlay");
    await meetingModal.getByLabel("موعد الاجتماع").fill(meetingDate);
    await meetingModal.getByRole("button", { name: "تأكيد الموعد" }).click();

    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const meeting = saved.agency.representation.interactions.find((item) => item.kind === "meeting");
    expect(meeting.status).toBe("scheduled");
    const beforeMeetingTrust = saved.agency.representation.contracts[0].relationshipScore;
    const beforeMeetingReputation = saved.agency.representation.reputationScore;

    const atMeeting = advanceSaveToDate(saved, meetingDate);
    await page.evaluate((snapshot) => {
      localStorage.setItem("football-agent.save", JSON.stringify(snapshot));
    }, atMeeting);
    await page.reload();
    await navigateTo(page, "الوكالة");
    await page.locator(".representation-meeting-complete-button").click();
    const outcomeModal = page.locator(".modal-overlay");
    await outcomeModal.getByLabel("نتيجة الاجتماع").selectOption("positive");
    await outcomeModal.getByRole("button", { name: "حفظ نتيجة الاجتماع" }).click();

    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.agency.representation.interactions.find((item) => item.id === meeting.id).outcome).toBe("positive");
    expect(saved.agency.representation.contracts[0].relationshipScore).toBe(beforeMeetingTrust + 7);
    expect(saved.agency.representation.reputationScore).toBe(beforeMeetingReputation + 2);
    expect(saved.agency.representation.history.some((entry) => entry.type === "meeting-completed")).toBe(true);
    expect(saved.agency.representation.reputationScore).toBeGreaterThanOrEqual(startingReputation);
  });

  test("opens a consolidated client dossier with contract terms and relationship history", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await page.locator(".representation-prospect-card").first().locator(".representation-offer-button").click();
    const offerModal = page.locator(".modal-overlay");
    await offerModal.getByLabel("نسبة العمولة").selectOption("15");
    await offerModal.getByLabel("مدة العقد").selectOption("1095");
    await offerModal.getByRole("button", { name: "إرسال عرض التمثيل" }).click();
    await page.locator(".representation-evaluate-button").click();
    await page.locator(".representation-accept-button").click();

    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const contract = saved.agency.representation.contracts[0];
    expect(saved.agency.clients).toContain(contract.playerId);
    await page.locator(".representation-message-button").click();

    await page.locator(".representation-client-dossier-button").click();
    const dossier = page.getByRole("dialog", { name: "ملف العميل" });
    await expect(dossier).toBeVisible();
    await expect(dossier.locator(".representation-dossier-hero h3")).toHaveText(contract.playerName);
    await expect(dossier.getByRole("heading", { name: "العلاقة والثقة" })).toBeVisible();
    await expect(dossier.getByRole("heading", { name: "العقد الحالي" })).toBeVisible();
    await expect(dossier.locator(".representation-dossier-stat")).toHaveCount(6);
    await expect(dossier.getByText(/تمثيل حصري|تمثيل غير حصري/).first()).toBeVisible();
    await expect(dossier.getByRole("heading", { name: "الرسائل والاجتماعات" })).toBeVisible();
    await expect(dossier.getByText("بانتظار الرد").first()).toBeVisible();
    await expect(dossier.getByRole("heading", { name: "سجل العلاقة" })).toBeVisible();

    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.agency.representation.interactions[0].contractId).toBe(contract.id);
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-overlay")).toHaveCount(0);
  });

  test("shows consistent expanded world coverage across player and scouting screens", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");

    const metrics = page.locator(".players-screen .world-metrics .metric-card");
    await expect(metrics).toHaveCount(6);
    await expect(metrics.filter({ hasText: "المسابقات" }).locator(".metric-value")).toHaveText("15");
    await expect(metrics.filter({ hasText: "أصول الصور" }).locator(".metric-value")).toHaveText("48");
    await expect(page.locator(".player-card .club-crest")).toHaveCount(48);

    const crests = await page.locator(".player-card .club-crest").evaluateAll((items) => items.map((item) => ({
      clubId: item.dataset.clubId,
      color: item.dataset.clubColor,
      pathCount: item.querySelectorAll("svg path").length,
      label: item.getAttribute("aria-label")
    })));
    expect(new Set(crests.map((item) => item.clubId)).size).toBe(24);
    expect(crests.every((item) => /^#[0-9a-f]{6}$/i.test(item.color))).toBe(true);
    expect(crests.every((item) => item.pathCount >= 2 && item.label.includes("ليس الشعار الرسمي"))).toBe(true);

    await navigateTo(page, "الكشافون");
    await expect(page.locator(".scout-banner")).toContainText("من 12 دولة");
  });

  test("renders distinct SVG player portraits and reuses them in player details", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");

    const portraits = page.locator(".player-card .player-portrait");
    await expect(portraits).toHaveCount(48);

    const profiles = await portraits.evaluateAll((elements) => elements.map((element) => ({
      hair: element.dataset.hairStyle,
      face: element.dataset.faceShape,
      beard: element.dataset.facialHair,
      kit: element.dataset.kitPattern,
      assetId: element.dataset.portraitAssetId,
      assetVersion: element.dataset.portraitVersion,
      paths: element.querySelectorAll("svg path").length
    })));
    expect(new Set(profiles.map((profile) => profile.face)).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.hair)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(profiles.map((profile) => profile.kit)).size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.assetId)).size).toBe(48);
    expect(profiles.every((profile) => profile.assetId.startsWith("portrait-") && profile.assetVersion === "1")).toBe(true);
    expect(profiles.every((profile) => profile.paths >= 10)).toBe(true);

    const animationName = await portraits.first().locator(".portrait-athlete").evaluate(
      (element) => getComputedStyle(element).animationName
    );
    expect(animationName).toBe("portrait-idle");

    const firstCard = page.locator(".player-card").first();
    const firstPlayerName = await firstCard.locator(".player-name").textContent();
    await firstCard.getByRole("button", { name: "ملف اللاعب" }).click();
    await expect(page.locator(".modal-player-art .portrait-svg")).toBeVisible();
    await expect(page.locator(".modal-player-art")).toHaveAttribute("aria-label", "رسم اللاعب " + firstPlayerName);
    await expect(page.locator(".modal-player-art")).toHaveAttribute("data-hair-style", profiles[0].hair);
    await expect(page.locator(".modal-player-art")).toHaveAttribute("data-portrait-asset-id", profiles[0].assetId);
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

  test("labels all market cards as illustrative preview data", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الانتقالات");
    await expect(page.locator(".market-preview-notice")).toContainText("ليست عروض انتقال حقيقية");
    await expect(page.locator(".market-preview-state")).toHaveText("DEMO DATA");
    await expect(page.locator(".market-card")).toHaveCount(3);
    await hasNoHorizontalOverflow(page);
  });
});

test.describe("Mobile experience", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps the representation offer form usable on mobile", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await expect(page.locator(".representation-prospect-grid")).toBeVisible();
    await page.locator(".representation-prospect-card").first().locator(".representation-offer-button").click();
    await expect(page.getByLabel("نسبة العمولة")).toBeVisible();
    await expect(page.getByLabel("مدة العقد")).toBeVisible();
    await hasNoHorizontalOverflow(page);
  });

  test("searches the agency prospect pool without changing its source data", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الوكالة");
    await expect(page.locator(".representation-prospect-card")).toHaveCount(48);
    const search = page.getByRole("searchbox", { name: "البحث عن لاعب لضمّه" });
    await search.fill("ياسين");
    await expect(page.locator(".representation-prospect-card")).toHaveCount(1);
    await expect(page.locator(".representation-prospect-card")).toContainText("ياسين عادل");
    await search.fill("لا يوجد لاعب بهذا الاسم");
    await expect(page.locator(".representation-prospect-grid .empty-results")).toBeVisible();
    await page.getByRole("button", { name: "مسح البحث" }).click();
    await expect(page.locator(".representation-prospect-card")).toHaveCount(48);
    await hasNoHorizontalOverflow(page);
  });

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
    await expect(page.locator(".dashboard-quick-action")).toHaveCount(3);
    await expect(page.locator(".home-menu-grid .home-tile")).toHaveCount(0);
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
    await expect(page.locator(".player-card")).toHaveCount(48);
    await hasNoHorizontalOverflow(page);
  });

  test("filters the player library by role and nationality and supports sorting", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");
    const role = page.getByLabel("تصفية حسب مركز اللاعب");
    const country = page.getByLabel("تصفية حسب الجنسية");
    const league = page.getByLabel("تصفية حسب الدوري");
    const sort = page.getByLabel("ترتيب اللاعبين");

    await role.selectOption("هجوم");
    const attackCount = await page.locator(".player-card").count();
    expect(attackCount).toBeGreaterThan(0);
    expect(attackCount).toBeLessThan(48);

    await country.selectOption("مصر");
    const egyptAttackCount = await page.locator(".player-card").count();
    expect(egyptAttackCount).toBeGreaterThan(0);
    expect(egyptAttackCount).toBeLessThanOrEqual(attackCount);

    await role.selectOption("all");
    await country.selectOption("all");
    await league.selectOption("league-br-serie-a");
    await expect(page.locator(".player-card")).toHaveCount(4);
    await expect(page.locator(".player-card").first().locator(".player-club")).toContainText("الدوري البرازيلي");
    await league.selectOption("all");
    await sort.selectOption("youngest");
    await expect(page.locator(".player-card").first().locator(".player-country")).toContainText("18 سنة");
    await hasNoHorizontalOverflow(page);
  });

  test("opens a complete player dossier and starts a representation offer from the profile", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "اللاعبون");
    await page.getByRole("searchbox", { name: "البحث عن لاعب" }).fill("ياسين عادل");
    await page.locator(".player-card").getByRole("button", { name: "ملف اللاعب" }).click();

    const dossier = page.getByRole("dialog", { name: "ملف اللاعب" });
    await expect(dossier.locator(".player-profile-identity h3")).toHaveText("ياسين عادل");
    await expect(dossier.locator(".player-profile-stats")).toContainText("OVR");
    await expect(dossier.locator(".player-profile-details")).toContainText("الأهلي");
    await expect(dossier.locator(".player-profile-details")).toContainText("الدوري المصري الممتاز");
    await dossier.getByRole("button", { name: "بدء عرض تمثيل" }).click();
    await expect(page.getByRole("dialog", { name: "عرض تمثيل جديد" })).toBeVisible();
    await expect(page.getByLabel("نسبة العمولة")).toBeVisible();
    await hasNoHorizontalOverflow(page);
  });

  test("filters scouting candidates and persists the watchlist", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");
    const roleFilter = page.getByLabel("تصفية حسب المركز");
    await roleFilter.selectOption("هجوم");
    await expect(page.locator(".player-card")).toHaveCount(12);
    await roleFilter.selectOption("حراسة");
    await expect(page.locator(".player-card")).toHaveCount(12);
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

  test("runs a paid scouting mission and persists its completed report", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");
    await page.getByRole("button", { name: /إطلاق بعثة كشف/ }).click();

    await page.getByLabel("مستوى البعثة").selectOption("local");
    await page.getByLabel("مصدر المواهب").selectOption("academy");
    await page.getByLabel("الدولة المستهدفة").selectOption("country-eg");
    await page.getByLabel("المركز المستهدف").selectOption("هجوم");
    await expect(page.getByText(/1 لاعب ضمن نطاق البحث/)).toBeVisible();
    await expect(page.getByText(/قناة الاكتشاف: أكاديميات الشباب/)).toBeVisible();
    await page.getByRole("button", { name: "تأكيد إطلاق البعثة" }).click();

    const started = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(started.meta.version).toBe(4);
    expect(started.agency.balance).toBe(95000);
    expect(started.world.scouting.activeMissions).toHaveLength(1);
    expect(started.world.scouting.activeMissions[0].sourceId).toBe("academy");
    expect(started.world.scouting.activeMissions[0].targetCount).toBe(1);
    expect(started.world.scouting.reports).toHaveLength(0);

    await navigateTo(page, "الرئيسية");
    for (let day = 0; day < 7; day += 1) {
      await page.locator(".day-advance-button").click();
    }

    const completed = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(completed.world.currentDate).toBe("2026-07-08");
    expect(completed.world.scouting.activeMissions).toHaveLength(0);
    expect(completed.world.scouting.reports).toHaveLength(1);
    expect(completed.world.scouting.reports[0].sourceId).toBe("academy");
    expect(completed.world.scouting.reports[0].candidateCount).toBe(1);
    expect(completed.world.scouting.observations).toHaveLength(1);
    expect(completed.world.scouting.observations[0].sourceIds).toEqual(["academy"]);

    await navigateTo(page, "الكشافون");
    await expect(page.getByRole("button", { name: "عرض التقرير" })).toBeVisible();
    await page.getByRole("button", { name: "عرض التقرير" }).click();
    const reportDialog = page.getByRole("dialog", { name: "تقرير الكشافين" });
    await expect(reportDialog).toBeVisible();
    await expect(page.locator(".scout-finding-rationale").first()).toBeVisible();
    await expect(reportDialog.getByRole("button", { name: "بدء عرض تمثيل" })).toBeVisible();
    await expect(reportDialog.getByRole("button", { name: "إضافة لصندوق المواهب" })).toBeVisible();

    // Save this discovery to the persistent talent pipeline before outreach.
    await reportDialog.getByRole("button", { name: "إضافة لصندوق المواهب" }).click();
    const pipelineDialog = page.getByRole("dialog", { name: "متابعة لاعب في صندوق المواهب" });
    await expect(pipelineDialog).toBeVisible();
    await pipelineDialog.getByLabel("مرحلة متابعة اللاعب").selectOption("shortlisted");
    await pipelineDialog.getByLabel("موعد المتابعة القادمة").fill("2026-07-15");
    await pipelineDialog.getByLabel("ملاحظات الوكالة").fill("مراجعة اللاعب بعد التقرير الأول");
    await pipelineDialog.getByRole("button", { name: "حفظ متابعة المواهب" }).click();

    const trackedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(trackedSave.agency.talentPipeline.entries).toHaveLength(1);
    expect(trackedSave.agency.talentPipeline.entries[0].playerId).toBe(completed.world.scouting.reports[0].findings[0].playerId);
    expect(trackedSave.agency.talentPipeline.entries[0].stage).toBe("shortlisted");
    expect(trackedSave.agency.talentPipeline.entries[0].nextFollowUpDate).toBe("2026-07-15");
    expect(trackedSave.agency.talentPipeline.entries[0].note).toBe("مراجعة اللاعب بعد التقرير الأول");

    // Assign an active scout and verify the agency workload panel.
    await navigateTo(page, "الوكالة");
    await expect(page.locator(".talent-staff-panel")).toBeVisible();
    await expect(page.locator(".talent-staff-card")).toHaveCount(4);
    await page.locator(".talent-pipeline-manage-button").click();
    const assignmentDialog = page.getByRole("dialog", { name: "متابعة لاعب في صندوق المواهب" });
    await assignmentDialog.getByLabel("مسؤول ملف اللاعب").selectOption("scout-north-africa");
    await assignmentDialog.getByRole("button", { name: "حفظ متابعة المواهب" }).click();
    let assignedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(assignedSave.agency.talentPipeline.entries[0].assignedScoutId).toBe("scout-north-africa");
    expect(page.locator(".talent-staff-card").filter({ hasText: "عمر شريف" })).toBeTruthy();

    // Record a first contact before making a representation offer.
    await page.locator(".talent-pipeline-contact-button").click();
    const contactDialog = page.getByRole("dialog", { name: "تواصل أولي مع ياسين عادل" });
    await expect(contactDialog).toBeVisible();
    await contactDialog.getByLabel("طريقة التواصل").selectOption("call");
    await contactDialog.getByLabel("نتيجة التواصل").selectOption("pending");
    await contactDialog.getByLabel("موعد المتابعة القادمة").fill("2026-07-10");
    await contactDialog.getByLabel("ملخص التواصل").fill("تحدثنا مع اللاعب وينتظر مراجعة العرض.");
    await contactDialog.getByRole("button", { name: "حفظ التواصل في سجل اللاعب" }).click();

    const contactedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const contactedEntry = contactedSave.agency.talentPipeline.entries[0];
    expect(contactedEntry.stage).toBe("contacted");
    expect(contactedEntry.note).toBe("مراجعة اللاعب بعد التقرير الأول");
    expect(contactedEntry.lastContactDate).toBe("2026-07-08");
    expect(contactedEntry.nextFollowUpDate).toBe("2026-07-10");
    expect(contactedEntry.activity.filter((event) => event.type === "stage")).toHaveLength(2);
    expect(contactedEntry.activity.filter((event) => event.type === "contact")).toHaveLength(1);
    expect(contactedEntry.activity.at(-1)).toMatchObject({
      type: "contact",
      kind: "call",
      outcome: "pending",
      followUpDate: "2026-07-10",
      note: "تحدثنا مع اللاعب وينتظر مراجعة العرض."
    });
    const pendingFollowUpTask = contactedSave.world.tasks.find((task) =>
      task.category === "talent-follow-up" && task.prospectId === contactedEntry.id
    );
    expect(pendingFollowUpTask).toBeTruthy();
    expect(pendingFollowUpTask.dueDate).toBe("2026-07-10");
    const pendingFollowUpTaskId = pendingFollowUpTask.id;
    expect(contactedSave.agency.clients).toHaveLength(0);
    expect(contactedSave.agency.representation.offers).toHaveLength(0);
    expect(contactedSave.agency.representation.contracts).toHaveLength(0);
    expect(contactedSave.agency.representation.interactions).toHaveLength(0);

    await page.locator(".talent-pipeline-history-button").click();
    const historyDialog = page.getByRole("dialog", { name: "سجل نشاط ياسين عادل" });
    await expect(historyDialog).toContainText("تواصل مكالمة · بانتظار الرد");
    await expect(historyDialog).toContainText("تحدثنا مع اللاعب وينتظر مراجعة العرض.");
    await historyDialog.getByRole("button", { name: "إغلاق" }).last().click();

    // A positive follow-up response now exposes a direct path into negotiation.
    await page.locator(".talent-pipeline-contact-button").click();
    const followupDialog = page.getByRole("dialog", { name: "تواصل أولي مع ياسين عادل" });
    await followupDialog.getByLabel("طريقة التواصل").selectOption("meeting");
    await followupDialog.getByLabel("نتيجة التواصل").selectOption("positive");
    await followupDialog.getByLabel("موعد المتابعة القادمة").fill("2026-07-12");
    await followupDialog.getByLabel("ملخص التواصل").fill("اللاعب أبدى اهتمامه بمناقشة التمثيل.");
    await followupDialog.getByRole("button", { name: "حفظ التواصل في سجل اللاعب" }).click();
    await expect(page.locator(".talent-pipeline-offer-button")).toBeVisible();
    const positiveSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(positiveSave.agency.talentPipeline.entries[0].activity.filter((event) => event.type === "contact")).toHaveLength(2);
    expect(positiveSave.agency.talentPipeline.entries[0].activity.at(-1).outcome).toBe("positive");
    const rescheduledFollowUpTasks = positiveSave.world.tasks.filter((task) =>
      task.category === "talent-follow-up" && ["open", "overdue"].includes(task.status)
    );
    expect(rescheduledFollowUpTasks).toHaveLength(1);
    expect(rescheduledFollowUpTasks[0].id).toBe(pendingFollowUpTaskId);
    expect(rescheduledFollowUpTasks[0].dueDate).toBe("2026-07-12");
    await page.locator(".talent-pipeline-offer-button").click();
    const offerDialog = page.getByRole("dialog", { name: "عرض تمثيل جديد" });
    await expect(offerDialog).toBeVisible();
    await offerDialog.getByLabel("نسبة العمولة").selectOption("15");
    await offerDialog.getByLabel("مدة العقد").selectOption("1095");
    await offerDialog.getRoleByRole?.("button", { name: "إرسال عرض التمثيل" }).click();
    const offerSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(offerSave.agency.representation.offers).toHaveLength(1);
    expect(offerSave.agency.representation.offers[0].playerId).toBe(completed.world.scouting.reports[0].findings[0].playerId);
    expect(offerSave.agency.representation.offers[0].status).toBe("pending");
    expect(offerSave.agency.clients).toHaveLength(0);
    expect(offerSave.agency.talentPipeline.entries).toHaveLength(1);

    await page.locator(".representation-evaluate-button").click();
    await expect(page.locator(".representation-offer-row.is-countered")).toBeVisible();
    await page.locator(".representation-accept-button").click();
    const signedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const signedEntry = signedSave.agency.talentPipeline.entries[0];
    expect(signedSave.agency.clients).toContain(signedEntry.playerId);
    expect(signedSave.agency.representation.contracts[0].status).toBe("active");
    expect(signedEntry.assignedScoutId).toBeUndefined();
    expect(signedEntry.nextFollowUpDate).toBeNull();
    expect(signedEntry.activity.at(-1)).toMatchObject({ type: "assignment", reason: "contract-signed" });
    const closedProspectTask = signedSave.world.tasks.find((task) => task.id === pendingFollowUpTaskId);
    expect(closedProspectTask.status).toBe("completed");
    expect(closedProspectTask.completionReason).toBe("contract-signed");

    await navigateTo(page, "الوكالة");
    await expect(page.locator(".agency-screen")).toBeVisible();
    await expect(page.locator(".talent-pipeline-panel")).toBeVisible();
    await expect(page.locator(".talent-pipeline-panel .representation-heading > .representation-count")).toHaveText("1 ملف موحّد");
    await expect(page.locator(".talent-pipeline-card")).toHaveCount(1);
    await expect(page.locator(".talent-pipeline-stage")).toHaveText("عميل حالي");
    await expect(page.locator(".talent-pipeline-followup")).toHaveCount(0);
    await page.locator(".representation-message-button").click();
    const clientSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(clientSave.agency.representation.interactions[0].kind).toBe("message");
    await page.locator(".representation-client-dossier-button").click();
    const signedClientDossier = page.getByRole("dialog", { name: "ملف العميل" });
    await expect(signedClientDossier.locator(".representation-dossier-hero h3")).toHaveText(signedEntry.playerName);
    await expect(signedClientDossier.getByRole("heading", { name: "الرسائل والاجتماعات" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await navigateTo(page, "الوكالة");
    await expect(page.locator(".talent-pipeline-card")).toHaveCount(1);
    await expect(page.locator(".talent-pipeline-note")).toHaveText("مراجعة اللاعب بعد التقرير الأول");

    await page.reload();
    await navigateTo(page, "الكشافون");
    await expect(page.getByRole("button", { name: "عرض التقرير" })).toBeVisible();

    // The due date creates an agency reminder, then the user records the review.
    await navigateTo(page, "الرئيسية");
    for (let day = 0; day < 4; day += 1) {
      await page.locator(".day-advance-button").click();
    }
    const dueSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(dueSave.world.currentDate).toBe("2026-07-12");
    const dueEvents = dueSave.world.events.filter((event) => event.type === "talent-follow-up-due");
    expect(dueEvents).toHaveLength(1);
    expect(dueSave.world.inbox.some((message) => message.eventId === dueEvents[0].id && !message.read)).toBe(true);

    await navigateTo(page, "الوكالة");
    await page.locator(".talent-pipeline-complete-followup-button").click();
    const reviewedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const reviewedEntry = reviewedSave.agency.talentPipeline.entries[0];
    expect(reviewedEntry.nextFollowUpDate).toBeNull();
    expect(reviewedEntry.activity.at(-1).type).toBe("follow-up-reviewed");
    expect(reviewedSave.world.tasks.find((task) => task.id === pendingFollowUpTaskId).status).toBe("completed");
    expect(reviewedSave.agency.representation.offers).toHaveLength(1);
    expect(reviewedSave.agency.clients).toHaveLength(0);
    await page.reload();
    await navigateTo(page, "الكشافون");
    await expect(page.getByRole("button", { name: "عرض التقرير" })).toBeVisible();
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
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
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
    expect(saved.meta.version).toBe(4);
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
    const completionEvent = saved.world.events.find((event) => event.type === "task-completed");
    expect(completionEvent).toBeTruthy();
    expect(saved.world.inbox).toContainEqual(expect.objectContaining({
      eventId: completionEvent.id,
      date: "2026-07-06",
      title: completionEvent.title,
      read: false
    }));

    await page.locator(".message-read-button").last().click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.inbox[0].read).toBe(true);
    expect(saved.world.inbox.some((message) =>
      message.eventId === completionEvent.id && message.read === false
    )).toBe(true);
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
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
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
    const expectedOverdueDate = await page.evaluate(() => new Intl.DateTimeFormat("ar-EG", {
      day: "numeric", month: "long", year: "numeric"
    }).format(new Date("2026-07-02T12:00:00")));
    await expect(overdueTask.locator(".career-activity-copy small"))
      .toContainText("متأخرة منذ: " + expectedOverdueDate);
    await overdueTask.getByRole("button", { name: "إنجاز" }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.tasks[0].status).toBe("completed");
    expect(saved.world.tasks[0].completedLate).toBe(true);
  });

  test("localizes seasonal and task events and exposes their priority", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      const types = [
        "weekly-briefing", "monthly-market", "season-opening", "preseason-review",
        "midseason-review", "season-review", "season-closing", "task-overdue", "task-completed"
      ];
      save.world.events = types.map((type, index) => ({
        id: "localized-event-" + type,
        date: "2026-08-" + String(index + 1).padStart(2, "0"),
        type,
        title: "حدث " + index,
        description: "تفاصيل الحدث " + index,
        priority: index % 2 === 0 ? "high" : "normal"
      }));
      save.world.inbox = [];
      save.world.tasks = [];
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();
    await page.getByRole("button", { name: "عرض السجل الكامل" }).click();

    const dialog = page.getByRole("dialog", { name: "سجل الأحداث" });
    await expect(dialog.locator(".event-history-row")).toHaveCount(9);
    await expect(dialog.locator(".event-history-row").filter({ hasText: "مراجعة ما قبل الموسم" })).toHaveCount(1);
    await expect(dialog.locator(".event-history-row").filter({ hasText: "مراجعة منتصف الموسم" })).toHaveCount(1);
    await expect(dialog.locator(".event-history-row").filter({ hasText: "إنجاز مهمة" })).toHaveCount(1);
    await expect(dialog.locator(".event-history-priority").first()).toContainText("الأولوية:");

    const search = dialog.getByRole("searchbox", { name: "البحث في سجل الأحداث" });
    await search.fill("مراجعة ما قبل الموسم");
    await expect(dialog.locator(".event-history-row")).toHaveCount(1);
    await search.clear();
    await dialog.getByLabel("تصفية نوع الحدث").selectOption("midseason-review");
    await expect(dialog.locator(".event-history-row")).toHaveCount(1);
    await expect(dialog.locator(".event-history-row")).toContainText("الأولوية: عالية");
    await hasNoHorizontalOverflow(page);
  });

  test("searches and filters the event history", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
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
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      save.world.currentDate = "2026-07-10";
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
          overdueDate: "2026-07-09",
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
    const expectedOverdueDate = await page.evaluate(() => new Intl.DateTimeFormat("ar-EG", {
      day: "numeric", month: "long", year: "numeric"
    }).format(new Date("2026-07-04T12:00:00")));
    await expect(dialog.locator(".task-history-row .career-activity-copy small"))
      .toContainText("متأخرة منذ: " + expectedOverdueDate);

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
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.currentDate).toBe("2026-07-01");
    expect(saved.world.events.some((event) => event.type === "season-opening")).toBe(true);
    await expect(page.locator(".career-calendar-panel")).toBeVisible();
    await expect(page.getByText("انطلاق موسم جديد").first()).toBeVisible();
  });

  test("opens the next-year calendar and displays the season milestones", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
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


test.describe("Inbox archive", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("searches all retained messages, filters read state and marks a message without closing the archive", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[aria-label="حفظ المسيرة"]').click();
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem("football-agent.save"));
      const records = Array.from({ length: 15 }, (_, index) => {
        const suffix = String(index).padStart(2, "0");
        const eventId = "event-inbox-" + suffix;
        return {
          event: {
            id: eventId,
            date: save.world.currentDate,
            type: "weekly-briefing",
            title: "حدث صندوق " + suffix,
            description: "حدث تجريبي للرسالة " + suffix,
            priority: "normal"
          },
          message: {
            id: "message-inbox-" + suffix,
            eventId,
            date: save.world.currentDate,
            title: "رسالة رقم " + suffix,
            body: "تفاصيل محفوظة للرسالة " + suffix,
            read: index % 2 === 0
          }
        };
      });
      save.world.events = records.map((record) => record.event);
      save.world.inbox = records.map((record) => record.message);
      localStorage.setItem("football-agent.save", JSON.stringify(save));
    });
    await page.reload();
    await page.getByRole("button", { name: "عرض كل الرسائل" }).click();

    const dialog = page.getByRole("dialog", { name: "صندوق الوارد" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".inbox-modal-item")).toHaveCount(15);
    await expect(dialog.locator(".event-history-count")).toHaveText("١٥ رسالة");

    const search = dialog.getByRole("searchbox", { name: "البحث في صندوق الوارد" });
    await search.fill("رسالة رقم 14");
    await expect(dialog.locator(".inbox-modal-item")).toHaveCount(1);
    await expect(dialog.locator(".inbox-modal-item strong")).toHaveText("رسالة رقم 14");

    await search.clear();
    const filter = dialog.getByLabel("تصفية حالة الرسالة");
    await filter.selectOption("read");
    await expect(dialog.locator(".inbox-modal-item")).toHaveCount(8);
    await filter.selectOption("unread");
    await expect(dialog.locator(".inbox-modal-item")).toHaveCount(7);

    await dialog.locator(".inbox-modal-item").first().getByRole("button", { name: "تحديد كمقروء" }).click();
    await expect(dialog.locator(".inbox-modal-item")).toHaveCount(6);
    await expect(dialog).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.inbox.filter((message) => message.read).length).toBe(9);
    await hasNoHorizontalOverflow(page);
  });

  test("assigns a specialist scout and persists experience after the report", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");
    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)")).toHaveCount(4);

    await page.getByRole("button", { name: /إطلاق بعثة كشف/ }).click();
    await page.getByLabel("مستوى البعثة").selectOption("local");
    await page.getByLabel("الدولة المستهدفة").selectOption("country-eg");
    await page.getByLabel("المركز المستهدف").selectOption("هجوم");
    await page.getByLabel("الكشاف المكلف").selectOption("scout-north-africa");
    await expect(page.locator(".scout-launch-preview")).toContainText("الدقة بعد خبرة الكشاف");
    await page.getByRole("button", { name: "تأكيد إطلاق البعثة" }).click();

    const started = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(started.world.scouting.activeMissions[0].scoutId).toBe("scout-north-africa");
    expect(started.world.scouting.activeMissions[0].accuracy).toBeGreaterThan(0.62);

    await navigateTo(page, "الرئيسية");
    for (let day = 0; day < 7; day += 1) {
      await page.locator(".day-advance-button").click();
    }

    const completed = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const scout = completed.world.scouting.scouts.find((item) => item.id === "scout-north-africa");
    expect(completed.world.scouting.reports[0].scoutId).toBe("scout-north-africa");
    expect(completed.world.scouting.reports[0].experienceAwarded).toBe(20);
    expect(scout.experience).toBe(80);
    expect(scout.missionsCompleted).toBe(1);

    await navigateTo(page, "الكشافون");
    await expect(page.locator(".scout-staff-card").filter({ hasText: "عمر شريف" })).toContainText("1 بعثة مكتملة");
    await expect(page.locator(".scout-report-row")).toContainText("عمر شريف");
    await hasNoHorizontalOverflow(page);
  });

});


test.describe("Scouting discovery channels and observation history", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("filters by a discovery channel and persists repeat observations across reloads", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");

    const launchMission = async () => {
      await page.getByRole("button", { name: /إطلاق بعثة كشف/ }).click();
      await page.getByLabel("مستوى البعثة").selectOption("local");
      await page.getByLabel("مصدر المواهب").selectOption("academy");
      await page.getByLabel("الدولة المستهدفة").selectOption("country-eg");
      await page.getByLabel("المركز المستهدف").selectOption("هجوم");
      await expect(page.getByText(/1 لاعب ضمن نطاق البحث/)).toBeVisible();
      await page.getByRole("button", { name: "تأكيد إطلاق البعثة" }).click();
    };

    const advanceSevenDays = async () => {
      await navigateTo(page, "الرئيسية");
      for (let day = 0; day < 7; day += 1) {
        await page.locator(".day-advance-button").click();
      }
      await navigateTo(page, "الكشافون");
    };

    await launchMission();
    await advanceSevenDays();
    await launchMission();
    await advanceSevenDays();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(saved.world.scouting.observations).toHaveLength(2);
    expect(saved.world.scouting.observations.every((item) => item.playerId === "demo-yassin-adel")).toBe(true);

    await page.getByRole("button", { name: "عرض التقرير" }).first().click();
    await expect(page.getByRole("dialog", { name: "تقرير الكشافين" })).toBeVisible();
    await page.getByRole("button", { name: "سجل الرصد (2)" }).click();
    const historyDialog = page.getByRole("dialog", { name: "سجل رصد اللاعب" });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.locator(".scout-history-observation")).toHaveCount(2);
    await expect(historyDialog.getByText("أكاديميات الشباب").first()).toBeVisible();

    await historyDialog.getByRole("button", { name: "إغلاق السجل" }).click();
    await page.getByRole("button", { name: "إغلاق التقرير" }).click();
    await page.reload();
    await navigateTo(page, "الكشافون");
    await page.getByRole("button", { name: "عرض التقرير" }).first().click();
    await page.getByRole("button", { name: "سجل الرصد (2)" }).click();
    await expect(page.getByRole("dialog", { name: "سجل رصد اللاعب" }).locator(".scout-history-observation")).toHaveCount(2);
    await hasNoHorizontalOverflow(page);
  });
});


test.describe("Scouting recruitment contracts", () => {
  test("signs and persists an annual scout contract, then assigns the contracted scout", async ({ page }) => {
    await page.goto("/"); await navigateTo(page, "الكشافون");
    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)")).toHaveCount(4); await expect(page.locator(".scout-recruit-card")).toHaveCount(2);
    const recruitCard = page.locator(".scout-recruit-card").filter({ hasText: "رافاييل أورتيغا" });
    await expect(recruitCard).toContainText("18,000"); await recruitCard.getByRole("button", { name: "توقيع عقد سنوي" }).click();
    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)")).toHaveCount(5); await expect(page.locator(".scout-recruit-card")).toHaveCount(1);
    const signed = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const contract = signed.world.scouting.scouts.find((scout) => scout.id === "scout-iberian-network");
    expect(signed.agency.balance).toBe(82000); expect(contract.contractStartedOn).toBe("2026-07-01");
    expect(contract.contractExpiresOn).toBe("2027-07-01"); expect(contract.contractCost).toBe(18000);
    await page.reload(); await navigateTo(page, "الكشافون"); await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)")).toHaveCount(5);
    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)").filter({ hasText: "رافاييل أورتيغا" })).toContainText("ينتهي في");
    await page.getByRole("button", { name: /إطلاق بعثة كشف/ }).click();
    await page.getByLabel("مستوى البعثة").selectOption("local"); await page.getByLabel("الدولة المستهدفة").selectOption("all");
    await page.getByLabel("المركز المستهدف").selectOption("all"); await page.getByLabel("الكشاف المكلف").selectOption("scout-iberian-network");
    await expect(page.locator(".scout-launch-preview")).toContainText("رافاييل أورتيغا");
    await page.getByRole("button", { name: "تأكيد إطلاق البعثة" }).click();
    const assigned = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    expect(assigned.world.scouting.activeMissions[0].scoutId).toBe("scout-iberian-network"); await hasNoHorizontalOverflow(page);
  });
});

test.describe("Scouting recruitment contracts on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps annual scout recruitment usable and persisted on a phone viewport", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "الكشافون");

    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)")).toHaveCount(4);
    await expect(page.locator(".scout-recruit-card")).toHaveCount(2);

    const recruitCard = page.locator(".scout-recruit-card").filter({ hasText: "ماتياس كروغر" });
    await expect(recruitCard).toContainText("15,000");
    await recruitCard.getByRole("button", { name: "توقيع عقد سنوي" }).click();

    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)")).toHaveCount(5);
    await expect(page.locator(".scout-recruit-card")).toHaveCount(1);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("football-agent.save")));
    const contract = saved.world.scouting.scouts.find((scout) => scout.id === "scout-central-europe");
    expect(saved.agency.balance).toBe(85000);
    expect(contract.contractStartedOn).toBe("2026-07-01");
    expect(contract.contractExpiresOn).toBe("2027-07-01");
    expect(contract.contractCost).toBe(15000);

    await expect(page.locator(".scout-staff-card:not(.scout-recruit-card)").filter({ hasText: "ماتياس كروغر" })).toContainText("ينتهي في");
    await hasNoHorizontalOverflow(page);
  });
});
