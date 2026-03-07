/**
 * E2E Test: Authentication flows
 *
 * Tests 1-3: Login, logout, setup page redirect
 */
import { test, expect } from "@playwright/test";

const email = process.env.E2E_EMAIL || "e2e-admin@test.com";
const password = process.env.E2E_PASSWORD || "TestPass123!";

// ─── Test 1: Login → Dashboard ─────────────────────────────────────────────

test("login flow redirects to dashboard", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? undefined });
  const page = await context.newPage();

  await page.goto("/login");

  // Verify login page elements
  await expect(page.getByText("Sign in to your account")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  // Fill credentials and submit
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Should redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  await context.close();
});

// ─── Test 2: Logout → redirect to login ─────────────────────────────────────

test("logout clears session and redirects to login", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? undefined });
  const page = await context.newPage();

  // First login
  await page.request.post("/api/v1/auth/login", {
    data: { email, password },
  });

  await page.goto("/dashboard");
  await page.waitForSelector("h1:has-text('Dashboard')", { timeout: 15_000 });

  // Logout via API then clear cookies
  await page.request.post("/api/v1/auth/logout");
  await context.clearCookies();

  // Navigate — should show login or landing page since no refresh_token cookie
  await page.goto("/dashboard");
  await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await context.close();
});

// ─── Test 3: Setup page redirects when users exist ──────────────────────────

test("setup page redirects to login when users already exist", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL: baseURL ?? undefined });
  const page = await context.newPage();

  await page.goto("/setup");

  // Should redirect to /login since users already exist
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await context.close();
});
