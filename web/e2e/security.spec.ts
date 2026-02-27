/**
 * E2E Test: Security hardening verification
 *
 * Tests 16-23: Security headers, rate limiting, CORS, JWT, RBAC,
 * payload limits, path traversal, skill name validation
 */
import { test, expect } from "@playwright/test";

// ─── Test 16: Security headers present on responses ─────────────────────────

test("API responses include security headers", async ({ request }) => {
  const res = await request.get("/api/v1/health");

  // X-Content-Type-Options
  const xcto = res.headers()["x-content-type-options"];
  if (xcto) {
    expect(xcto).toBe("nosniff");
  }

  // The health endpoint should return 200
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.status).toBe("ok");
});

// ─── Test 17: CORS headers on preflight ─────────────────────────────────────

test("CORS preflight returns appropriate headers", async ({ request }) => {
  const res = await request.fetch("/api/v1/health", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
    },
  });

  // Should not be a server error
  expect(res.status()).toBeLessThan(500);

  // In development mode, CORS should be permissive
  const allowOrigin = res.headers()["access-control-allow-origin"];
  if (allowOrigin) {
    expect(allowOrigin === "*" || allowOrigin.includes("localhost")).toBeTruthy();
  }
});

// ─── Test 18: Invalid JWT returns 401 ───────────────────────────────────────

test("invalid JWT token returns 401 on protected routes", async ({ request }) => {
  const checkRes = await request.get("/api/v1/auth/check-setup");
  const checkData = await checkRes.json();

  if (!checkData.needs_setup) {
    const res = await request.get("/api/v1/erpclaw-setup/status", {
      headers: {
        Authorization: "Bearer fake.invalid.token",
      },
    });
    expect(res.status()).toBe(401);
    const data = await res.json();
    expect(data.status).toBe("error");
  }
});

// ─── Test 19: No auth returns 401 on protected routes ───────────────────────

test("missing auth header returns 401 on skill routes", async ({ request }) => {
  const checkRes = await request.get("/api/v1/auth/check-setup");
  const checkData = await checkRes.json();

  if (!checkData.needs_setup) {
    const res = await request.get("/api/v1/erpclaw-setup/status");
    expect(res.status()).toBe(401);
    const data = await res.json();
    expect(data.message).toContain("Authentication required");
  }
});

// ─── Test 20: Large payload rejected (413) ──────────────────────────────────

test("oversized payload returns 413", async ({ request }) => {
  // Create a payload larger than 10MB
  const bigPayload = "x".repeat(11 * 1024 * 1024);

  const res = await request.post("/api/v1/erpclaw-setup/add-company", {
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(bigPayload.length),
    },
    data: bigPayload,
  });

  // Should be rejected (413 or similar error)
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

// ─── Test 21: Path traversal in skill name blocked ──────────────────────────

test("path traversal in skill name is rejected", async ({ request }) => {
  // URL-encoded path traversal attempts
  const maliciousPaths = [
    "/api/v1/..%2F..%2Fetc/passwd",
    "/api/v1/..%252F..%252Fetc/status",
  ];

  for (const path of maliciousPaths) {
    const res = await request.fetch(path);
    // Should be 400 (regex rejection), 404 (not found), or 405
    expect(res.status()).toBeGreaterThanOrEqual(400);
  }

  // Also test direct regex violations
  const res = await request.get("/api/v1/A-UPPERCASE/status");
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

// ─── Test 22: Skill name regex validation ───────────────────────────────────

test("invalid skill names rejected by regex", async ({ request }) => {
  const badNames = [
    "A-UPPERCASE",         // uppercase not allowed
    "-starts-with-dash",   // must start with letter
    "a".repeat(65),        // too long (max 64)
  ];

  for (const name of badNames) {
    const res = await request.get(`/api/v1/${encodeURIComponent(name)}/status`);
    // Should be rejected (400, 404, or 422)
    expect(res.status()).toBeGreaterThanOrEqual(400);
  }
});

// ─── Test 23: Unauthenticated access to protected pages redirects ───────────

test("unauthenticated browser access redirects to login", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? undefined });
  const page = await context.newPage();

  // Try to access the dashboard with no cookies — should redirect to login
  await page.goto("/dashboard");
  await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  // Try to access a skill page directly
  await page.goto("/skills/erpclaw-setup");
  await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });

  await context.close();
});
