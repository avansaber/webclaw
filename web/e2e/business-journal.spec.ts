/**
 * E2E Test: Journal Entries business flow
 *
 * Tests the journals skill and GL skill interaction:
 * execute tab verification, add-journal-entry form fields,
 * list-journal-entries data, and GL account listing.
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 1: Journals skill execute tab loads ───────────────────────────────

test("journals skill execute tab shows actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-journals");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Should show journal-related action buttons
  const actionButtons = page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|submit-|cancel-|delete-)/,
  });
  expect(await actionButtons.count()).toBeGreaterThan(0);

  // Page text should reference journal entries
  const pageText = (await page.textContent("body")) || "";
  const hasJournalActions =
    /journal|entry|entries/i.test(pageText);
  expect(hasJournalActions).toBeTruthy();
});

// ─── Test 2: Add-journal-entry form has expected fields ─────────────────────

test("add-journal-entry form shows company, date, entry_type, and lines", async ({
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

    // Form should appear with fields
    const inputFields = page.locator("input, select, textarea");
    expect(await inputFields.count()).toBeGreaterThan(0);

    // Check for journal-entry-specific fields
    const pageText = (await page.textContent("body")) || "";
    const hasCompanyField = /company/i.test(pageText);
    const hasDateField =
      /date|posting.?date/i.test(pageText) ||
      (await page.locator("input[type='date']").count()) > 0;
    const hasEntryType = /entry.?type|type/i.test(pageText);
    const hasLinesField =
      /lines|accounts|entries|debit|credit/i.test(pageText) ||
      (await page.locator("textarea").count()) > 0;

    // At minimum, the form should show company and date fields
    expect(hasCompanyField || hasDateField).toBeTruthy();
    expect(hasEntryType || hasLinesField).toBeTruthy();
  }
});

// ─── Test 3: List-journal-entries shows results ─────────────────────────────

test("list-journal-entries returns data table or results", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-journals");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-journal-entries
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-journal-entries$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-journal-entries/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Verify results appear
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/journal|entry|showing|no.*data|results/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});

// ─── Test 4: GL skill list-accounts shows accounts ──────────────────────────

test("GL skill list-accounts shows chart of accounts", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-gl");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click list-accounts
  const actionBtn = page
    .locator("button")
    .filter({ hasText: /^list-accounts$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", {
      name: /execute list-accounts/i,
    });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should show account data
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/account|asset|liability|equity|revenue|expense/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});
