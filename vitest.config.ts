import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    env: {
      VITE_SUPABASE_URL: "https://ydkglitowqlpizpnnofy.supabase.co",
      VITE_SUPABASE_ANON_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlka2dsaXRvd3FscGl6cG5ub2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTc2NjEsImV4cCI6MjA5MDYzMzY2MX0.kJTWWxWN8cP4r1AtmM2XraJtjPM_qy8sxE2gHU9f8QE",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
