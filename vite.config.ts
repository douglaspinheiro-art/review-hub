import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  /**
   * Incluir @sentry/react + hoist-non-react-statics: o Sentry ESM faz `import x from 'hoist-non-react-statics'`
   * mas o pacote só publica CJS — sem pré-bundle, o Vite serve o .cjs e falta export `default` (SyntaxError em profiler.js).
   * O `exclude` anterior só em @sentry/react expunha esse caminho.
   */
  optimizeDeps: {
    include: ["@sentry/react", "hoist-non-react-statics"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@newsletter-html": path.resolve(__dirname, "./supabase/functions/_shared/newsletter-html.ts"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Hidden source maps: uploaded to Sentry/error tracker but not served to browsers.
    // Required for mapping production stack traces to original source code.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts": ["recharts"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-icons": ["lucide-react"],
          "vendor-sentry": ["@sentry/react"],
        },
      },
    },
  },
}));
