import { defineConfig } from "vitest/config"
import path from "path"
import { readFileSync } from "fs"

// What next.config.ts inlines for client components (src/lib/app-version.ts).
const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"))

export default defineConfig({
  test: {
    environment: "node",
    env: { APP_VERSION: version },
    // e2e/**/*.spec.ts are Playwright specs, not vitest tests.
    exclude: ["**/node_modules/**", "e2e/**", "src/__integration__/**"],
    coverage: {
      provider: "v8",
      // Routes and components too, not just src/lib: the API routes carry most of the
      // security-sensitive logic (tenant scoping, tokens, capacity).
      include: ["src/lib/**", "src/app/api/**", "src/components/**", "videos/lib/**"],
      exclude: ["**/__tests__/**"],
      reporter: ["text", "lcov"],
      // Floors just under the measured baseline (2026-09-29: 36.4 / 29.2 / 29.6 / 37.7), so a
      // drop fails CI (#317). Raise them as coverage grows; never lower them to make CI pass.
      thresholds: { statements: 35, branches: 28, functions: 28, lines: 36 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
