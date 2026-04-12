import { createLovableConfig } from "lovable-agent-playwright-config/config";

export default createLovableConfig({
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080",
  },
});
