import { test, expect } from "@playwright/test";

/**
 * Smoke E2E contra preview/dev (CI: subir `vite preview` e definir PLAYWRIGHT_BASE_URL).
 * Não depende de Supabase real — valida que rotas públicas renderizam.
 */
test.describe("rotas públicas", () => {
  test("página de login", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const loginHeading = page.getByRole("heading", { name: /entrar na sua conta|recuperar senha/i });
    const maintenanceHeading = page.getByRole("heading", { name: /manutenção em curso/i });
    await expect(loginHeading.or(maintenanceHeading)).toBeVisible({ timeout: 20_000 });
  });

  test("página inicial", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const landingMain = page.locator("main");
    const maintenanceHeading = page.getByRole("heading", { name: /manutenção em curso/i });
    await expect(landingMain.or(maintenanceHeading)).toBeVisible({ timeout: 20_000 });
  });
});
