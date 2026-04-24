import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    launchOptions: {
      executablePath: "/nix/store/2zqa6kavc8znbgrac1l3pix9lwr3w5nj-playwright-chromium/chrome-linux/chrome",
    },
  },
});
