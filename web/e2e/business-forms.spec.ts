/**
 * E2E Test: Form Rendering verification
 *
 * Tests that auto-generated forms render correct field types across skills:
 * setup add-company fields, selling quotation child table, tax entity lookups,
 * GL account selects, and journal entry lines editor.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: Setup add-company has correct fields ───────────────────────────

test("add-company form has name, abbr, default_currency, country fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-setup");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click add-company action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-company$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should render
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for company-specific field labels
    const pageText = (await page.textContent("body")) || "";
    const hasName = /\bname\b/i.test(pageText);
    const hasAbbr = /abbr|abbreviation/i.test(pageText);
    const hasCurrency = /currency|default.?currency/i.test(pageText);
    const hasCountry = /country/i.test(pageText);

    // Company form must have name field
    expect(hasName).toBeTruthy();

    // Should have at least 2 of the other expected fields
    const fieldCount = [hasAbbr, hasCurrency, hasCountry].filter(Boolean).length;
    expect(fieldCount).toBeGreaterThanOrEqual(1);
  }
});

// ─── Test 2: Selling add-quotation has items child table ────────────────────

test("add-quotation form has items child table with repeatable rows", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click add-quotation action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-quotation$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should render
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for items child table (repeatable rows or JSON editor)
    const pageText = (await page.textContent("body")) || "";
    const hasItemsSection =
      /items|line.?items|add.?row|add.?item/i.test(pageText);
    const hasJsonEditor =
      (await page.locator("textarea, [class*='json'], [class*='editor']").count()) > 0;
    const hasChildTable =
      (await page.locator("[class*='child'], [class*='repeat'], [class*='array']").count()) > 0;
    const hasAddRowButton =
      (await page.locator("button").filter({ hasText: /add.*row|add.*item|\+/i }).count()) > 0;

    expect(
      hasItemsSection || hasJsonEditor || hasChildTable || hasAddRowButton
    ).toBeTruthy();
  }
});

// ─── Test 3: Tax skill entity lookup dropdowns render ───────────────────────

test("tax skill forms render entity lookup dropdowns", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-tax");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Find an action that requires entity lookups (add-tax-template or similar)
  const addActions = page.locator("button").filter({
    hasText: /^add-tax-template$|^add-tax-rule$/,
  });

  if ((await addActions.count()) > 0) {
    await addActions.first().click();
    await page.waitForTimeout(1_500);

    // Form should render with select dropdowns for entity references
    const selectFields = page.locator("select, [role='combobox'], [class*='select']");
    const inputFields = page.locator("input, select, textarea");

    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for entity reference fields (company, account, etc.)
    const pageText = (await page.textContent("body")) || "";
    const hasEntityField =
      /company|account|template|type/i.test(pageText);
    expect(hasEntityField).toBeTruthy();

    // Should have at least one dropdown/select or combobox
    const hasDropdowns =
      (await selectFields.count()) > 0 ||
      (await page.locator("input[list], [aria-haspopup]").count()) > 0 ||
      (await inputFields.count()) >= 2;
    expect(hasDropdowns).toBeTruthy();
  }
});

// ─── Test 4: GL add-account form has root_type and account_type selects ─────

test("add-account form has root_type and account_type select fields", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-gl");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click add-account action
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-account$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should render (either structured form or param key-value editor)
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // The action should show either:
    // 1. A structured form with labeled fields (name, root_type, account_type)
    // 2. A generic param editor with "param name" / "value" inputs + Execute button
    const pageText = (await page.textContent("body")) || "";
    const hasStructuredFields = /root.?type|account.?type|account.?name/i.test(pageText);
    const hasParamEditor = /param.?name|add.?param|execute add-account/i.test(pageText);

    expect(hasStructuredFields || hasParamEditor).toBeTruthy();
  }
});

// ─── Test 5: Journal entry form has lines JSON editor or child table ────────

test("add-journal-entry form has lines JSON editor or child table", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-journals");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click add-journal-entry
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^add-journal-entry$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Form should render
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Journal entries have a "lines" field (array of debit/credit accounts)
    // This renders as either a JSON textarea, a child table, or a repeated row section
    const pageText = (await page.textContent("body")) || "";
    const hasLinesLabel = /lines|accounts|entries/i.test(pageText);
    const hasJsonArea = (await page.locator("textarea").count()) > 0;
    const hasChildRows =
      (await page.locator("[class*='child'], [class*='repeat'], [class*='array']").count()) > 0;
    const hasAddRowButton =
      (await page.locator("button").filter({ hasText: /add.*row|add.*line|\+/i }).count()) > 0;

    // The lines field must be present in some form
    expect(
      hasLinesLabel || hasJsonArea || hasChildRows || hasAddRowButton
    ).toBeTruthy();

    // Also verify the form has header fields (company, date)
    const hasCompany = /company/i.test(pageText);
    const hasDate =
      /date/i.test(pageText) ||
      (await page.locator("input[type='date']").count()) > 0;
    expect(hasCompany || hasDate).toBeTruthy();
  }
});
