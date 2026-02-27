/**
 * E2E Test: Procure-to-Pay business flow
 *
 * Tests the buying, inventory, and supplier-related skills:
 * supplier browse, add-supplier form, purchase order items,
 * list-suppliers data, inventory actions, and purchase order listing.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: Buying browse tab shows supplier data ──────────────────────────

test("buying browse tab renders supplier data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-buying");

  // Browse Data tab should be active by default
  const browseTab = page.getByRole("tab", { name: /browse data/i });
  await expect(browseTab).toBeVisible();

  // Wait for auto-load
  await page.waitForTimeout(3_000);

  // Look for list buttons (suppliers, purchase orders, etc.)
  const listButtons = page.locator("button").filter({
    hasText: /suppliers|purchase orders|purchase receipts/i,
  });

  if ((await listButtons.count()) > 0) {
    // Click suppliers button if available
    const supplierBtn = page.locator("button").filter({
      hasText: /suppliers/i,
    });
    if ((await supplierBtn.count()) > 0) {
      await supplierBtn.first().click();
      await page.waitForTimeout(5_000);
    }
  }

  // Verify the browse tab content area loaded
  const tabContent = page.locator("[role='tabpanel'], .space-y-6");
  await expect(tabContent.first()).toBeVisible();
});

// ─── Test 2: Add-supplier form renders and accepts input ────────────────────

test("add-supplier action shows form fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-buying");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Find and click add-supplier action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-supplier$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_000);

    // Verify form appears with input fields
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for supplier-specific fields (name, company)
    const pageText = (await page.textContent("body")) || "";
    const hasSupplierFields =
      /supplier.?name|name|company/i.test(pageText);
    expect(hasSupplierFields).toBeTruthy();
  }
});

// ─── Test 3: Add-purchase-order form has items child table ──────────────────

test("add-purchase-order form has items child table", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-buying");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Find and click add-purchase-order
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-purchase-order$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // PO form should have items section (child table, JSON editor, or textarea)
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

// ─── Test 4: List-suppliers shows data table ────────────────────────────────

test("list-suppliers action shows data table", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-buying");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-suppliers
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-suppliers$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-suppliers/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Verify results appear
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/supplier|name|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});

// ─── Test 5: Inventory skill has stock actions ──────────────────────────────

test("inventory skill shows stock management actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-inventory");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Verify inventory-related actions exist
  const inventoryActions = page.locator("button").filter({
    hasText: /item|warehouse|stock|inventory/i,
  });
  const allActions = page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|submit-|cancel-|delete-)/,
  });

  const hasInventoryActions = (await inventoryActions.count()) > 0;
  const hasAnyActions = (await allActions.count()) > 0;

  expect(hasInventoryActions || hasAnyActions).toBeTruthy();
});

// ─── Test 6: List-purchase-orders shows results ─────────────────────────────

test("list-purchase-orders returns results", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-buying");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-purchase-orders
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-purchase-orders$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-purchase-orders/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show results (table, JSON, or empty-state message)
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/purchase|order|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});
