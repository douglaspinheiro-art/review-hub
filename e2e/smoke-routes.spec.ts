import { test, expect } from "@playwright/test";

/**
 * Smoke E2E contra preview/dev (CI: subir `vite preview` e definir PLAYWRIGHT_BASE_URL).
 * Não depende de Supabase real — valida que rotas públicas renderizam.
 */
test.describe("rotas públicas", () => {
  test("página de login", async ({ page }) => {
    page.on("pageerror", (err) => {
      console.log("PAGE ERROR:", err);
    });
    const response = await page.goto("/login");
    expect(response && response.status() < 400).toBeTruthy();
    // Wait for React hydration, then check for any heading or form element
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: /entrar|login|conta/i }).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("página inicial", async ({ page }) => {
    page.on("pageerror", (err) => {
      console.log("PAGE ERROR:", err);
    });
    const response = await page.goto("/");
    expect(response && response.status() < 400).toBeTruthy();
    // Wait for React hydration, then check for brand presence
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 20_000 });
    await expect(
      page.locator("text=LTV Boost").first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
