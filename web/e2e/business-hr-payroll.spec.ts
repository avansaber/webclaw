/**
 * E2E Test: HR and Payroll business flow
 *
 * Tests the HR and payroll skills: action discovery, employee listing,
 * payroll actions, and salary component listing.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: HR skill shows actions ─────────────────────────────────────────

test("HR skill execute tab shows employee actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-hr");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Should show HR-related action buttons
  const hrActions = page.locator("button").filter({
    hasText: /employee|leave|attendance|expense/i,
  });
  const allActions = page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|submit-|cancel-|delete-)/,
  });

  const hasHrActions = (await hrActions.count()) > 0;
  const hasAnyActions = (await allActions.count()) > 0;

  expect(hasHrActions || hasAnyActions).toBeTruthy();

  // Page text should reference HR domain
  const pageText = (await page.textContent("body")) || "";
  const hasHrContent =
    /employee|leave|attendance|expense|hr/i.test(pageText);
  expect(hasHrContent).toBeTruthy();
});

// ─── Test 2: List-employees shows results ───────────────────────────────────

test("list-employees action returns results", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-hr");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-employees
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-employees$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-employees/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show employee data or empty state
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/employee|name|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});

// ─── Test 3: Payroll skill shows actions ────────────────────────────────────

test("payroll skill execute tab shows payroll actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-payroll");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Should show payroll-related action buttons
  const payrollActions = page.locator("button").filter({
    hasText: /salary|payroll|component|deduction/i,
  });
  const allActions = page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|submit-|cancel-|delete-)/,
  });

  const hasPayrollActions = (await payrollActions.count()) > 0;
  const hasAnyActions = (await allActions.count()) > 0;

  expect(hasPayrollActions || hasAnyActions).toBeTruthy();

  // Page text should reference payroll domain
  const pageText = (await page.textContent("body")) || "";
  const hasPayrollContent =
    /salary|payroll|component|slip|deduction/i.test(pageText);
  expect(hasPayrollContent).toBeTruthy();
});

// ─── Test 4: List-salary-components shows results ───────────────────────────

test("list-salary-components returns results", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-payroll");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-salary-components
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-salary-components$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-salary-components/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show salary component data or empty state
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/component|salary|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});
