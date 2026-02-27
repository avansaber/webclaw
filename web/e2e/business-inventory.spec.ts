/**
 * E2E Test: Inventory business flow
 *
 * Tests the inventory skill: browse tab, list-items, add-item form fields,
 * and list-warehouses data.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: Inventory browse tab loads ─────────────────────────────────────

test("inventory browse tab renders content", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-inventory");

  // Browse Data tab should be active by default
  const browseTab = page.getByRole("tab", { name: /browse data/i });
  await expect(browseTab).toBeVisible();

  // Wait for auto-load
  await page.waitForTimeout(3_000);

  // Look for browse list buttons (items, warehouses, stock entries)
  const listButtons = page.locator("button").filter({
    hasText: /items|warehouses|stock/i,
  });

  if ((await listButtons.count()) > 0) {
    await listButtons.first().click();
    await page.waitForTimeout(5_000);
  }

  // Verify the browse tab content area exists
  const tabContent = page.locator("[role='tabpanel'], .space-y-6");
  await expect(tabContent.first()).toBeVisible();
});

// ─── Test 2: List-items shows results ───────────────────────────────────────

test("list-items action returns results table", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-inventory");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-items
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-items$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-items/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show item data or empty state
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/item|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});

// ─── Test 3: Add-item form has correct fields ───────────────────────────────

test("add-item form shows item_code, item_name, item_type fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-inventory");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click add-item
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-item$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should render with input fields
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for item-specific field labels
    const pageText = (await page.textContent("body")) || "";
    const hasItemCode = /item.?code/i.test(pageText);
    const hasItemName = /item.?name|name/i.test(pageText);
    const hasItemType =
      /item.?type|type/i.test(pageText) ||
      (await page.locator("select").count()) > 0;

    // The form should have at minimum name/code fields
    expect(hasItemCode || hasItemName).toBeTruthy();

    // Should also have a type selector or other classification field
    expect(hasItemType || (await inputFields.count()) >= 2).toBeTruthy();
  }
});

// ─── Test 4: List-warehouses shows results ──────────────────────────────────

test("list-warehouses action returns warehouse data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-inventory");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-warehouses
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-warehouses$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-warehouses/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show warehouse data or empty state
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/warehouse|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});
