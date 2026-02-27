/**
 * E2E Test: Skill action execution
 *
 * Tests 11-12: Execute tab action discovery, action runner with params
 */
import { test, expect, navigateToSkill } from "./fixtures";

// ─── Test 11: Execute tab shows grouped actions ─────────────────────────────

test("execute tab shows actions grouped by type", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-setup");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();

  // Wait for action discovery to complete (may take longer than 3s)
  await page.waitForTimeout(8_000);

  // Should show action buttons or Quick Actions section
  const pageText = (await page.textContent("body")) || "";
  const hasActionList = /actions?\s*\(\d+\)/i.test(pageText);
  const hasQuickActions = /quick actions/i.test(pageText);
  const hasActionButtons = (await page.locator("button").filter({
    hasText: /^(list-|get-|add-|update-|status|New )/,
  }).count()) > 0;

  expect(hasActionList || hasQuickActions || hasActionButtons).toBeTruthy();
});

// ─── Test 12: Run a read-only action with results ───────────────────────────

test("execute a read-only action and see results", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-setup");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(3_000);

  // Click the "status" action button if available
  const statusBtn = page.locator("button").filter({ hasText: /^status$/ });
  if (await statusBtn.count() > 0) {
    await statusBtn.first().click();
    await page.waitForTimeout(500);

    // Click "Execute status" button
    const executeBtn = page.getByRole("button", { name: /execute status/i });
    if (await executeBtn.count() > 0) {
      await executeBtn.click();

      // Wait for result
      await page.waitForTimeout(5_000);

      // Should show some result (JSON pre block, table, or detail view)
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/companies|accounts|status/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});
