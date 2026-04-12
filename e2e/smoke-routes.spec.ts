import { test, expect } from "@playwright/test";

/**
 * Smoke E2E contra preview/dev (CI: subir `vite preview` e definir PLAYWRIGHT_BASE_URL).
 * Não depende de Supabase real — valida que rotas públicas renderizam.
 */
test.describe("rotas públicas", () => {
  test("página de login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  });

  test("página inicial", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
