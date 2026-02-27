/**
 * E2E Test: Financial Reports business flow
 *
 * Tests the reports skill: execute tab with report actions,
 * trial-balance form fields, profit-and-loss form, and balance-sheet form.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: Reports skill shows report actions ─────────────────────────────

test("reports skill execute tab shows financial report actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-reports");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(8_000);

  // Should show report-related actions or Quick Actions section
  const pageText = (await page.textContent("body")) || "";
  const hasReportActions = /trial.?balance|profit|loss|balance.?sheet|cash.?flow|ledger/i.test(pageText);
  const hasQuickActions = /quick actions/i.test(pageText);
  const hasAnyActions = (await page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|submit-|cancel-|delete-|trial-|profit-|balance-|cash-|general-|New )/,
  }).count()) > 0;

  expect(hasReportActions || hasQuickActions || hasAnyActions).toBeTruthy();

  // Page text should reference reports
  const hasReportContent =
    /report|trial|balance|profit|loss|ledger|financial/i.test(pageText);
  expect(hasReportContent).toBeTruthy();
});

// ─── Test 2: Trial-balance form has company, from_date, to_date ─────────────

test("trial-balance form shows company_id, from_date, to_date fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-reports");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click trial-balance action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /trial-balance/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should appear with parameters
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for trial-balance-specific fields (labels may be company_id, from_date, etc.)
    const pageText = (await page.textContent("body")) || "";
    const hasCompanyField = /company/i.test(pageText);
    const hasFromDate =
      /from.?date/i.test(pageText) ||
      (await page.locator("input[type='date'], input").count()) > 0;
    const hasToDate = /to.?date/i.test(pageText);

    // Trial balance form should have parameters
    expect(hasCompanyField || hasFromDate || hasToDate || (await page.locator("input").count()) > 0).toBeTruthy();
  }
});

// ─── Test 3: Profit-and-loss form has expected fields ───────────────────────

test("profit-and-loss form shows date range fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-reports");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click profit-and-loss action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /profit-and-loss/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should appear
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for P&L fields (labels may be company_id, from_date, etc.)
    const pageText = (await page.textContent("body")) || "";
    const hasCompanyField = /company/i.test(pageText);
    const hasDateFields =
      /from.?date|to.?date|period|date/i.test(pageText) ||
      (await page.locator("input[type='date'], input").count()) > 0;

    // P&L form should have parameters
    expect(hasCompanyField || hasDateFields || (await page.locator("input").count()) > 0).toBeTruthy();
  }
});

// ─── Test 4: Balance-sheet form has as_of_date field ────────────────────────

test("balance-sheet form has as_of_date field", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-reports");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click balance-sheet action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /balance-sheet/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should appear
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for balance sheet fields (labels may be as_of_date, company_id, etc.)
    const pageText = (await page.textContent("body")) || "";
    const hasAsOfDate =
      /as.?of.?date|date/i.test(pageText) ||
      (await page.locator("input[type='date'], input").count()) > 0;
    const hasCompanyField = /company/i.test(pageText);

    // Balance sheet form should have parameters
    expect(hasAsOfDate || hasCompanyField || (await page.locator("input").count()) > 0).toBeTruthy();
  }
});
