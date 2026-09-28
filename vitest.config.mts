import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    // e2e/**/*.spec.ts are Playwright specs, not vitest tests.
    exclude: ["**/node_modules/**", "e2e/**"],
    coverage: {
      provider: "v8",
      // Routes and components too, not just src/lib: the API routes carry most of the
      // security-sensitive logic (tenant scoping, tokens, capacity).
      include: ["src/lib/**", "src/app/api/**", "src/components/**"],
      exclude: ["**/__tests__/**"],
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
