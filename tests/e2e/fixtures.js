import { test as base, expect } from "@playwright/test";

// Existing application-flow tests cover the game, not the first-run tour.
// Start them after dismissing onboarding; onboarding has its own dedicated test.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("football-agent.tutorial.done", "1");
      } catch {}
    });
    await use(page);
  }
});

export { expect };
