import { test, expect } from "@playwright/test";

/**
 * Smoke E2E contra preview/dev (CI: subir `vite preview` e definir PLAYWRIGHT_BASE_URL).
 * Não depende de Supabase real — valida que rotas públicas renderizam.
 */
test.describe("rotas públicas", () => {
  test("página de login", async ({ page }) => {
    const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(response && response.status() < 400).toBeTruthy();
    await expect(page.locator("#root")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#root").locator("*").first()).toBeVisible({ timeout: 20_000 });
  });

  test("página inicial", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response && response.status() < 400).toBeTruthy();
    await expect(page.locator("#root")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#root").locator("*").first()).toBeVisible({ timeout: 20_000 });
  });
});
