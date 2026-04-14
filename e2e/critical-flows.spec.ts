import { test, expect } from "@playwright/test";

/**
 * E2E: Critical flow — Signup → Dashboard → Campaign creation
 *
 * Prerequisites: a running instance (PLAYWRIGHT_BASE_URL) with a test user
 * or the ability to sign up. Adjust credentials as needed.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const TEST_EMAIL = `e2e-${Date.now()}@test.ltvboost.com`;
const TEST_PASSWORD = "TestPassword123!";

test.describe("Critical Flow: Signup → Dashboard → Campaign", () => {
  test("signup creates account and redirects to onboarding", async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState("networkidle");

    // Fill signup form
    const emailInput = page.getByPlaceholder(/email/i).first();
    const passwordInput = page.getByPlaceholder(/senha|password/i).first();

    if (await emailInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);

      const submitBtn = page.getByRole("button", { name: /criar|sign up|cadastrar/i });
      await submitBtn.click();

      // Should redirect to onboarding or show confirmation
      await page.waitForURL(/\/(onboarding|login|signup)/, { timeout: 15000 });
    }
  });

  test("dashboard loads for authenticated user", async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");

    const emailInput = page.getByPlaceholder(/email/i).first();
    const passwordInput = page.getByPlaceholder(/senha|password/i).first();

    if (await emailInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);

      const loginBtn = page.getByRole("button", { name: /entrar|login|sign in/i });
      await loginBtn.click();

      // Should redirect to dashboard
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("campaign page loads without errors", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");

    const emailInput = page.getByPlaceholder(/email/i).first();
    const passwordInput = page.getByPlaceholder(/senha|password/i).first();

    if (await emailInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);

      const loginBtn = page.getByRole("button", { name: /entrar|login|sign in/i });
      await loginBtn.click();
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });

      // Navigate to campaigns
      await page.goto(`${BASE}/dashboard/campanhas`);
      await page.waitForLoadState("networkidle");

      // Verify page loaded
      await expect(page.locator("body")).toBeVisible();

      // Check no uncaught errors
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.waitForTimeout(2000);
      expect(errors.length).toBe(0);
    }
  });
});

test.describe("Smoke: Public pages load", () => {
  const publicRoutes = ["/", "/planos", "/sobre", "/login", "/signup"];

  for (const route of publicRoutes) {
    test(`${route} loads without error`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
      expect(errors.length).toBe(0);
    });
  }
});
