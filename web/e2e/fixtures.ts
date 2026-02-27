/**
 * Shared Playwright fixtures for Webclaw E2E tests.
 *
 * Each test gets its own login session to avoid token rotation conflicts
 * when running in parallel.
 */
import { test as base, expect, type Page } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_EMAIL || "e2e-admin@test.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD || "TestPass123!";

/** Authenticated test — each worker logs in independently. */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ browser }, use, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    const context = await browser.newContext({
      ...(baseURL ? { baseURL } : {}),
    });
    const page = await context.newPage();

    // Login via API — each context gets its own refresh token
    await page.request.post("/api/v1/auth/login", {
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    });

    // The Set-Cookie header from login sets the refresh_token cookie.
    // Now navigate — the middleware sees the cookie and passes through.
    // AuthProvider calls /auth/refresh to get an access token.
    await use(page);
    await context.close();
  },
});

export { expect };

/** Wait for the dashboard to fully load (heading visible). */
export async function waitForDashboard(page: Page) {
  await page.waitForSelector("h1:has-text('Dashboard')", { timeout: 15_000 });
}

/** Navigate to a skill page and wait for tabs to load. */
export async function navigateToSkill(page: Page, skillName: string) {
  await page.goto(`/skills/${skillName}`);
  // Wait for either the tabs or the skill content to appear
  await page.waitForSelector("[role='tablist'], .space-y-6", {
    timeout: 15_000,
  });
}
