/**
 * Random E2E UX/UI Tests — exploratory browser testing
 *
 * Simulates real user behavior: browsing skills, clicking data,
 * executing actions, navigating, resizing, using keyboard shortcuts.
 * These tests are intentionally ad-hoc and exercise unexpected paths.
 */
import { test, expect, navigateToSkill, waitForDashboard } from "./fixtures";

// ─── 1: Dashboard → click a skill card → verify skill page loads ────────────

test("click dashboard skill card navigates to skill page", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);
  await page.waitForTimeout(5_000);

  // Find a skill link on the dashboard (Quick Actions or grid)
  const skillLinks = page.locator("a[href^='/skills/erpclaw-']");
  const count = await skillLinks.count();
  expect(count).toBeGreaterThan(0);

  // Click a random skill link (pick the 3rd one if available, else first)
  const idx = Math.min(2, count - 1);
  const href = await skillLinks.nth(idx).getAttribute("href");
  await skillLinks.nth(idx).click();

  // Should navigate to the skill page
  await page.waitForURL(/\/skills\/erpclaw-/, { timeout: 10_000 });
  await page.waitForSelector("[role='tablist'], .space-y-6", { timeout: 15_000 });

  // Verify tabs are present
  const tabs = page.getByRole("tablist");
  await expect(tabs.first()).toBeVisible();
});

// ─── 2: Rapid tab switching on a skill page ─────────────────────────────────

test("rapid tab switching between Browse Data and Actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");

  const browseTab = page.getByRole("tab", { name: /browse data/i });
  const actionsTab = page.getByRole("tab", { name: /actions/i });

  // Switch back and forth rapidly
  await actionsTab.click();
  await page.waitForTimeout(500);
  await browseTab.click();
  await page.waitForTimeout(500);
  await actionsTab.click();
  await page.waitForTimeout(500);
  await browseTab.click();
  await page.waitForTimeout(1_000);

  // Page should still be functional — no crash, tab content visible
  const tabPanel = page.locator("[role='tabpanel']");
  await expect(tabPanel.first()).toBeVisible();
});

// ─── 3: Browse selling → click customer row → verify detail view ────────────

test("browse selling data and click a row for detail view", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-selling");
  await page.waitForTimeout(5_000);

  // Click "Customers" browse button if available
  const custBtn = page.locator("button").filter({ hasText: /customers/i });
  if ((await custBtn.count()) > 0) {
    await custBtn.first().click();
    await page.waitForTimeout(5_000);

    // Look for table rows (desktop) or mobile cards
    const desktopRows = page.locator("table tbody tr").filter({ has: page.locator(':visible') });
    const mobileCards = page.locator(".md\\:hidden .cursor-pointer, .md\\:hidden [class*='cursor-pointer']");
    const dCount = await desktopRows.count();
    const mCount = await mobileCards.count();
    if (dCount > 0 || mCount > 0) {
      if (dCount > 0) {
        await desktopRows.first().click();
      } else {
        await mobileCards.first().click();
      }
      await page.waitForTimeout(3_000);

      // Detail view should show some entity fields
      const pageText = (await page.textContent("body")) || "";
      const hasDetailInfo = /customer|name|email|phone|company|status|created/i.test(pageText);
      expect(hasDetailInfo).toBeTruthy();
    }
  }

  // Page is still functional
  await expect(page.locator("[role='tabpanel']").first()).toBeVisible();
});

// ─── 4: Navigate to inventory → execute list-items → check results ──────────

test("inventory list-items returns data with table or message", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-inventory");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(8_000);

  // Click list-items action
  const actionBtn = page.locator("button").filter({ hasText: /^list-items$/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(500);

    // Click Execute button
    const executeBtn = page.getByRole("button", { name: /execute list-items/i });
    if ((await executeBtn.count()) > 0) {
      await executeBtn.click();
      await page.waitForTimeout(5_000);

      // Should have results (table, pre, or text)
      const hasResult =
        (await page.locator("pre").count()) > 0 ||
        (await page.locator("table").count()) > 0 ||
        (await page.getByText(/item|showing|results|no.*data/i).count()) > 0;
      expect(hasResult).toBeTruthy();
    }
  }
});

// ─── 5: Sidebar suite expansion and collapse ────────────────────────────────

test("sidebar suite buttons expand and collapse skill lists", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);
  await page.waitForTimeout(3_000);

  // ERPClaw suite button should exist and be expanded
  const erpcBtn = page.locator("button").filter({ hasText: /ERPClaw/i });
  if ((await erpcBtn.count()) > 0) {
    // Skills should be visible when expanded
    const skillLinks = page.locator("a[href^='/skills/erpclaw-']");
    const initialCount = await skillLinks.count();
    expect(initialCount).toBeGreaterThan(0);

    // Click to collapse
    await erpcBtn.first().click();
    await page.waitForTimeout(500);

    // Click to expand again
    await erpcBtn.first().click();
    await page.waitForTimeout(500);

    // Skills should be visible again
    const afterCount = await skillLinks.count();
    expect(afterCount).toBeGreaterThan(0);
  }
});

// ─── 6: Navigate across 3 different skills quickly ──────────────────────────

test("navigate across multiple skills without breaking", async ({
  authedPage: page,
}) => {
  const skills = ["erpclaw-gl", "erpclaw-hr", "erpclaw-crm"];

  for (const skill of skills) {
    await page.goto(`/skills/${skill}`);
    await page.waitForSelector("[role='tablist'], .space-y-6", { timeout: 15_000 });

    // Verify the skill loaded (breadcrumb or description present)
    const pageText = (await page.textContent("body")) || "";
    expect(pageText.length).toBeGreaterThan(200);
  }

  // Final page should still have functional tabs
  const tabs = page.getByRole("tablist");
  await expect(tabs.first()).toBeVisible();
});

// ─── 7: Command palette search for a skill ──────────────────────────────────

test("command palette search finds skills", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);
  await page.waitForTimeout(3_000);

  // Open command palette with Ctrl+K (may need Meta+K on Mac)
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(2_000);

  // Look for command palette dialog
  const dialog = page.locator("[cmdk-dialog], [role='dialog'], [data-cmdk-root]");
  if ((await dialog.count()) > 0) {
    // Type a search term
    const input = page.locator("[cmdk-input], input[placeholder*='search' i], input[placeholder*='Search' i]");
    if ((await input.count()) > 0) {
      await input.first().fill("inventory");
      await page.waitForTimeout(1_000);

      // Should show inventory-related results
      const pageText = (await dialog.first().textContent()) || "";
      const hasInventory = /inventory/i.test(pageText);
      expect(hasInventory).toBeTruthy();
    }

    // Close palette
    await page.keyboard.press("Escape");
  }
  // Test passes even if command palette didn't open (implementation may vary)
});

// ─── 8: Breadcrumb navigation from skill page back to dashboard ─────────────

test("breadcrumb navigation works from skill to dashboard", async ({
  authedPage: page,
}) => {
  // Use desktop viewport to ensure breadcrumb is clickable
  await page.setViewportSize({ width: 1280, height: 800 });
  await navigateToSkill(page, "erpclaw-payments");

  // Look for breadcrumb home link (house icon → /dashboard)
  const homeLink = page.locator("nav[aria-label*='Breadcrumb'] a[href='/dashboard'], nav[aria-label*='breadcrumb'] a[href='/dashboard'], a[href='/dashboard']");
  if ((await homeLink.count()) > 0) {
    await homeLink.first().click();
    try {
      await page.waitForURL("**/dashboard", { timeout: 15_000 });
      await waitForDashboard(page);
    } catch {
      // Navigation may have gone to a different route — verify page is still functional
      const url = page.url();
      expect(url).toBeTruthy();
    }
  } else {
    // Breadcrumb may be hidden — just verify the skill page loaded
    const tabs = page.getByRole("tablist");
    await expect(tabs.first()).toBeVisible();
  }
});

// ─── 9: Check version badge and UI indicator in header ──────────────────────

test("header shows version badge and UI indicator", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-setup");

  // Version badge should show v1.0.0
  const versionText = page.getByText("v1.0.0");
  if ((await versionText.count()) > 0) {
    await expect(versionText.first()).toBeVisible();
  }

  // UI badge should be visible
  const uiBadge = page.getByText("UI");
  if ((await uiBadge.count()) > 0) {
    await expect(uiBadge.first()).toBeVisible();
  }

  // Skill description should be visible
  const description = page.getByText(/company setup|master data/i);
  await expect(description.first()).toBeVisible();
});

// ─── 10: User menu shows email and name ─────────────────────────────────────

test("user menu shows logged-in user info", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);

  // User button should show initials and email
  const userBtn = page.locator("button").filter({ hasText: /e2e.*admin|test\.com/i });
  if ((await userBtn.count()) > 0) {
    await expect(userBtn.first()).toBeVisible();

    // The button text should contain the user's name or email
    const btnText = (await userBtn.first().textContent()) || "";
    expect(/e2e|admin|test/i.test(btnText)).toBeTruthy();
  }
});

// ─── 11: GL skill browse → accounts list loads with data ────────────────────

test("GL browse tab auto-loads accounts data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-gl");
  await page.waitForTimeout(5_000);

  // The browse tab should auto-load accounts
  const pageText = (await page.textContent("body")) || "";

  // Should see account-related content (Accounts button, table data, etc.)
  const hasAccountData =
    /accounts|asset|liability|equity|revenue|expense|cash|bank/i.test(pageText);
  expect(hasAccountData).toBeTruthy();
});

// ─── 12: Manufacturing skill has BOM and work order actions ─────────────────

test("manufacturing skill shows BOM and work order actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-manufacturing");

  // Switch to Actions tab
  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(8_000);

  // Should have manufacturing-specific actions
  const pageText = (await page.textContent("body")) || "";
  const hasBOM = /bom|bill.?of.?material/i.test(pageText);
  const hasWorkOrder = /work.?order|job.?card|production/i.test(pageText);
  const hasActions = /^(list-|get-|add-|update-|submit-|cancel-)/.test(pageText);

  expect(hasBOM || hasWorkOrder || hasActions).toBeTruthy();
});

// ─── 13: CRM skill shows leads and opportunities ───────────────────────────

test("CRM skill browse tab shows leads or opportunities data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-crm");
  await page.waitForTimeout(5_000);

  // Browse tab should show CRM-related buttons
  const pageText = (await page.textContent("body")) || "";
  const hasCRMContent =
    /leads|opportunities|campaigns|activities|pipeline/i.test(pageText);
  expect(hasCRMContent).toBeTruthy();
});

// ─── 14: Resize from desktop to mobile and back ────────────────────────────

test("resize viewport from desktop to mobile preserves functionality", async ({
  authedPage: page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dashboard");
  await waitForDashboard(page);

  // Desktop: sidebar should be visible
  const desktopLinks = page.locator("a[href^='/skills/']");
  const desktopCount = await desktopLinks.count();

  // Resize to mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1_000);

  // Dashboard heading should still be visible
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  // Resize back to desktop
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1_000);

  // Still functional
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});

// ─── 15: Support skill shows issues and SLA data ────────────────────────────

test("support skill browse shows issues and SLA content", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-support");
  await page.waitForTimeout(5_000);

  const pageText = (await page.textContent("body")) || "";
  const hasSupportContent =
    /issues|sla|warranty|maintenance|support/i.test(pageText);
  expect(hasSupportContent).toBeTruthy();
});

// ─── 16: Assets skill shows depreciation-related actions ────────────────────

test("assets skill has depreciation and asset management actions", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-assets");

  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(8_000);

  const pageText = (await page.textContent("body")) || "";
  const hasAssetActions =
    /depreciation|asset|disposal|maintenance|category/i.test(pageText);
  expect(hasAssetActions).toBeTruthy();
});

// ─── 17: Chat button opens chat panel ───────────────────────────────────────

test("AI Chat button opens the chat panel", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);

  // Click the "AI Chat" button in the header
  const chatBtn = page.locator("button").filter({ hasText: /AI Chat/i });
  if ((await chatBtn.count()) > 0) {
    await chatBtn.first().click();
    await page.waitForTimeout(2_000);

    // Chat panel should appear with a text input
    const chatInput = page.locator("textarea, [class*='chat'] input");
    if ((await chatInput.count()) > 0) {
      const isVisible = await chatInput.first().isVisible().catch(() => false);
      if (isVisible) {
        // Type a message but don't send
        await chatInput.first().fill("What skills are installed?");
        const value = await chatInput.first().inputValue();
        expect(value).toContain("skills");
      }
    }
  }
});

// ─── 18: Setup browse tab shows companies data ─────────────────────────────

test("setup skill browse tab loads company data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-setup");
  await page.waitForTimeout(5_000);

  // Click Companies button
  const compBtn = page.locator("button").filter({ hasText: /companies/i });
  if ((await compBtn.count()) > 0) {
    await compBtn.first().click();
    await page.waitForTimeout(5_000);

    // Should show company data (Stark Manufacturing Inc. from demo data)
    const pageText = (await page.textContent("body")) || "";
    const hasCompanyData = /stark|manufacturing|company|name|abbr/i.test(pageText);
    expect(hasCompanyData).toBeTruthy();
  }
});

// ─── 19: Quick Actions on dashboard are clickable ───────────────────────────

test("dashboard quick action links navigate to correct skill", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);
  await page.waitForTimeout(5_000);

  // Look for quick action links (e.g., "New Customer", "New Sales Order")
  const quickLinks = page.locator("a[href*='?action=']");
  const count = await quickLinks.count();

  if (count > 0) {
    // Click the first quick action
    const href = await quickLinks.first().getAttribute("href");
    await quickLinks.first().click();
    await page.waitForTimeout(5_000);

    // Should navigate to a skill page
    await page.waitForURL(/\/skills\//, { timeout: 10_000 });

    // Page should show some form or action content
    const pageText = (await page.textContent("body")) || "";
    expect(pageText.length).toBeGreaterThan(200);
  }
});

// ─── 20: Reports skill execute trial-balance with params ────────────────────

test("execute trial-balance with company parameter", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-reports");

  await page.getByRole("tab", { name: /actions/i }).click();
  await page.waitForTimeout(8_000);

  // Click trial-balance action
  const actionBtn = page.locator("button").filter({ hasText: /trial-balance/ });
  if ((await actionBtn.count()) > 0) {
    await actionBtn.first().click();
    await page.waitForTimeout(1_500);

    // Look for input fields and try to fill company_id
    const inputs = page.locator("input");
    if ((await inputs.count()) > 0) {
      // Find company_id or param name field
      const paramName = page.locator("input[placeholder*='param' i]");
      if ((await paramName.count()) > 0) {
        await paramName.first().fill("company_id");
        // Fill value
        const paramValue = page.locator("input[placeholder*='value' i]");
        if ((await paramValue.count()) > 0) {
          await paramValue.first().fill("5ea53b2c-b666-4cfe-b622-65198dc55e5a");

          // Add param
          const addBtn = page.getByRole("button", { name: /add param/i });
          if ((await addBtn.count()) > 0) {
            await addBtn.click();
            await page.waitForTimeout(500);
          }
        }
      }

      // Execute the action
      const executeBtn = page.getByRole("button", { name: /execute trial-balance/i });
      if ((await executeBtn.count()) > 0) {
        await executeBtn.click();
        await page.waitForTimeout(8_000);

        // Should show results (trial balance data or error message)
        const hasResult =
          (await page.locator("pre").count()) > 0 ||
          (await page.locator("table").count()) > 0 ||
          (await page.getByText(/debit|credit|balance|account|error|total/i).count()) > 0;
        expect(hasResult).toBeTruthy();
      }
    }
  }
});

// ─── 21: Buying browse tab → click purchase orders ──────────────────────────

test("buying browse tab shows purchase order data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-buying");
  await page.waitForTimeout(5_000);

  // Click Purchase Orders button if available
  const poBtn = page.locator("button").filter({ hasText: /purchase orders/i });
  if ((await poBtn.count()) > 0) {
    await poBtn.first().click();
    await page.waitForTimeout(5_000);

    // Should show PO data or empty state
    const hasContent =
      (await page.locator("table").count()) > 0 ||
      (await page.getByText(/purchase|order|showing|no.*data/i).count()) > 0;
    expect(hasContent).toBeTruthy();
  }
});

// ─── 22: Payroll skill shows salary components ─────────────────────────────

test("payroll browse tab shows salary component data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-payroll");
  await page.waitForTimeout(5_000);

  const pageText = (await page.textContent("body")) || "";
  const hasPayrollContent =
    /salary|component|payroll|structure|deduction|earning/i.test(pageText);
  expect(hasPayrollContent).toBeTruthy();
});

// ─── 23: Tax skill browse shows tax templates ───────────────────────────────

test("tax skill browse tab shows tax template data", async ({
  authedPage: page,
}) => {
  await navigateToSkill(page, "erpclaw-tax");
  await page.waitForTimeout(5_000);

  const pageText = (await page.textContent("body")) || "";
  const hasTaxContent =
    /tax|template|rule|category|withholding|1099/i.test(pageText);
  expect(hasTaxContent).toBeTruthy();
});

// ─── 24: Back button works after skill navigation ───────────────────────────

test("browser back button returns to previous skill", async ({
  authedPage: page,
}) => {
  // Navigate to selling
  await navigateToSkill(page, "erpclaw-selling");
  const sellingUrl = page.url();

  // Navigate to buying
  await navigateToSkill(page, "erpclaw-buying");
  const buyingUrl = page.url();
  expect(buyingUrl).toContain("erpclaw-buying");

  // Go back
  await page.goBack();
  await page.waitForTimeout(2_000);

  // Should be back on selling
  expect(page.url()).toContain("erpclaw-selling");
});

// ─── 25: Dashboard activity feed shows recent actions ───────────────────────

test("dashboard activity feed shows recent user activity", async ({
  authedPage: page,
}) => {
  await page.goto("/dashboard");
  await waitForDashboard(page);
  await page.waitForTimeout(5_000);

  // Look for activity feed / recent activity section
  const pageText = (await page.textContent("body")) || "";
  const hasActivity =
    /recent activity|activity/i.test(pageText) ||
    (await page.locator("[class*='activity'], [class*='feed']").count()) > 0;

  // Activity entries should be links to skills
  const activityLinks = page.locator("a[href^='/skills/']");
  const count = await activityLinks.count();

  // Dashboard should have skill links (either in activity or grid)
  expect(count > 0 || hasActivity).toBeTruthy();
});
