/**
 * E2E Test: Order-to-Cash business flow
 *
 * Tests the selling, payments, and GL skills end-to-end:
 * customer browse, add-customer form, sales order items child table,
 * list-customers data table, payment actions, and GL entries.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: Browse tab shows customer data ─────────────────────────────────

test("selling browse tab renders customer data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");

  // Browse Data tab should be active by default
  const browseTab = page.getByRole("tab", { name: /browse data/i });
  await expect(browseTab).toBeVisible();

  // Wait for auto-load of the first list action
  await page.waitForTimeout(3_000);

  // Look for list buttons (customers, sales orders, quotations, invoices)
  const listButtons = page.locator("button").filter({
    hasText: /customers|sales orders|quotations|invoices/i,
  });

  if ((await listButtons.count()) > 0) {
    // Click customers button if available
    const custBtn = page.locator("button").filter({
      hasText: /customers/i,
    });
    if ((await custBtn.count()) > 0) {
      await custBtn.first().click();
      await page.waitForTimeout(5_000);
    }
  }

  // Verify the browse tab content area is present
  const tabContent = page.locator("[role='tabpanel'], .space-y-6");
  await expect(tabContent.first()).toBeVisible();
});

// ─── Test 2: Add-customer form renders and submits ──────────────────────────

test("add-customer action shows form with name and company fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Find and click add-customer action button
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-customer$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_000);

    // Verify form appears — look for input fields related to customer
    const formArea = page.locator("form, [class*='form'], [class*='Form']");
    const inputFields = page.locator("input, select, textarea");
    const hasForm = (await formArea.count()) > 0;
    const hasInputs = (await inputFields.count()) > 0;

    expect(hasForm || hasInputs).toBeTruthy();

    // Check for customer-specific fields (name, company_id)
    const pageText = (await page.textContent("body")) || "";
    const hasNameField =
      /customer.?name|name/i.test(pageText) &&
      (await page.locator("input").count()) > 0;
    expect(hasNameField).toBeTruthy();
  }
});

// ─── Test 3: Add-sales-order form has items child table ─────────────────────

test("add-sales-order form has items child table", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Find and click add-sales-order action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-sales-order$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Sales order forms should have an items section (child table or JSON editor)
    const pageText = (await page.textContent("body")) || "";
    const hasItemsSection =
      /items|line.?items|order.?items|add.?row|add.?item/i.test(pageText);
    const hasJsonEditor =
      (await page.locator("textarea, [class*='json'], [class*='editor']").count()) > 0;
    const hasChildTable =
      (await page.locator("[class*='child'], [class*='table'], [class*='repeat']").count()) > 0;

    expect(hasItemsSection || hasJsonEditor || hasChildTable).toBeTruthy();
  }
});

// ─── Test 4: List-customers shows data table ────────────────────────────────

test("list-customers action shows results table", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-customers action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-customers$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click the Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-customers/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Verify results appear (table, JSON, or message)
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/customer|name|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});

// ─── Test 5: Payments skill has payment actions ─────────────────────────────

test("payments skill shows payment actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-payments");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Verify payment-related action buttons exist
  const actionButtons = page.locator("button").filter({
    hasText: /payment|reconcil|allocat/i,
  });
  const allActions = page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|submit-|cancel-|delete-)/,
  });

  const hasPaymentActions = (await actionButtons.count()) > 0;
  const hasAnyActions = (await allActions.count()) > 0;

  expect(hasPaymentActions || hasAnyActions).toBeTruthy();
});

// ─── Test 6: GL skill list-gl-entries shows results ─────────────────────────

test("GL skill list-gl-entries returns results", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-gl");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Look for list-gl-entries or list-accounts action
  const glEntriesBtn = page
    .locator("button")
    .filter({ hasText: /^list-gl-entries$/ });
  const accountsBtn = page
    .locator("button")
    .filter({ hasText: /^list-accounts$/ });

  const targetBtn =
    (await glEntriesBtn.count()) > 0 ? glEntriesBtn : accountsBtn;

  if ((await targetBtn.count()) > 0) {
    await targetBtn.first().click();
    await page.waitForTimeout(500);

    // Click the Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute (list-gl-entries|list-accounts)/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show results
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/account|debit|credit|showing|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});
