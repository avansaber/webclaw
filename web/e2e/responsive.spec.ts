/**
 * E2E Test: Responsive layout
 *
 * Tests 14-15: Mobile viewport, skill page on mobile
 */
import { test, expect, waitForDashboard } from "./fixtures";

// ─── Test 14: Mobile layout (375px) ─────────────────────────────────────────

test("mobile layout renders correctly at 375px", async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");
  await waitForDashboard(page);

  // Dashboard heading should still be visible
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  // Page should not have excessive horizontal overflow
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 50);
});

// ─── Test 15: Skill page renders on mobile ──────────────────────────────────

test("skill page is usable on mobile viewport", async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/skills/erpclaw-gl");

  // Wait for page to load (tabs or content)
  await page.waitForSelector("[role='tablist'], .space-y-6", { timeout: 15_000 });

  // Tabs should still be visible
  const tabs = page.getByRole("tablist");
  if (await tabs.count() > 0) {
    await expect(tabs.first()).toBeVisible();
  }

  // No excessive horizontal overflow
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 50);
});
