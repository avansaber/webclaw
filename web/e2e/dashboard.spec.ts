/**
 * E2E Test: Dashboard rendering
 *
 * Tests 4-5: Skill grid with categories, stat cards
 */
import { test, expect, waitForDashboard } from "./fixtures";

// ─── Test 4: Dashboard shows skill grid ─────────────────────────────────────

test("dashboard displays installed skills grid", async ({ authedPage: page }) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);

  // Dashboard heading should appear
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  // Wait for skills to load (stat cards appear after async fetch)
  await page.waitForTimeout(5_000);

  // Stat cards should show "Skills Installed" count or skill links should be present
  const hasSkillsText = (await page.getByText("Skills Installed").count()) > 0;
  const skillCards = page.locator("a[href^='/skills/']");
  const count = await skillCards.count();

  expect(hasSkillsText || count > 0).toBeTruthy();
});

// ─── Test 5: Dashboard stat cards render correctly ──────────────────────────

test("dashboard stat cards show categories count", async ({ authedPage: page }) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);

  // Wait for skills to load (stat cards appear after async fetch)
  await page.waitForTimeout(5_000);

  // System Online badge
  await expect(page.getByText("System Online")).toBeVisible();

  // The subtitle or stat cards should show skill/category info
  const pageText = (await page.textContent("body")) || "";
  const hasSkillInfo = /skills installed|categories|\d+ skills/i.test(pageText);
  expect(hasSkillInfo).toBeTruthy();
});
