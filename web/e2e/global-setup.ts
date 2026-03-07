/**
 * Playwright global setup — ensure test user exists.
 *
 * On a fresh instance (no users), creates the admin account via /auth/setup.
 * Otherwise, just verifies the test credentials work.
 */
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.E2E_BASE_URL ||
    config.projects[0]?.use?.baseURL ||
    "http://localhost:3000";

  const email = process.env.E2E_EMAIL || "e2e-admin@test.com";
  const password = process.env.E2E_PASSWORD || "TestPass123!";
  const fullName = "E2E Test Admin";

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // Check if setup is needed
  const checkRes = await page.request.get("/api/v1/auth/check-setup");
  const checkData = await checkRes.json();

  if (checkData.needs_setup) {
    console.log("[global-setup] No users found — creating admin account...");
    const setupRes = await page.request.post("/api/v1/auth/setup", {
      data: { email, password, full_name: fullName },
    });
    const setupData = await setupRes.json();
    if (setupData.status !== "ok") {
      throw new Error(`Setup failed: ${setupData.message}`);
    }
    console.log("[global-setup] Admin account created.");
  } else {
    // Verify credentials work
    const loginRes = await page.request.post("/api/v1/auth/login", {
      data: { email, password },
    });
    const loginData = await loginRes.json();
    if (loginData.status !== "ok") {
      throw new Error(
        `Login failed for ${email}: ${loginData.message}. ` +
        "Set E2E_EMAIL and E2E_PASSWORD env vars to valid credentials."
      );
    }
    console.log(`[global-setup] Verified login for ${email}`);
  }

  await browser.close();
}
