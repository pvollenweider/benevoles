import { defineConfig } from "vitest/config"
import path from "path"
import { readFileSync } from "fs"

// What next.config.ts inlines for client components (src/lib/app-version.ts).
const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"))

export default defineConfig({
  test: {
    environment: "node",
    env: { APP_VERSION: version },
    // e2e/**/*.spec.ts are Playwright specs, not vitest tests. The assistant worktrees
    // (.claude/worktrees/...) and the Next build output are never part of the suite.
    exclude: ["**/node_modules/**", "e2e/**", "src/__integration__/**", "**/.claude/**", "**/.next/**"],
    coverage: {
      provider: "v8",
      // Routes and components too, not just src/lib: the API routes carry most of the
      // security-sensitive logic (tenant scoping, tokens, capacity).
      include: ["src/lib/**", "src/app/api/**", "src/components/**", "videos/lib/**"],
      exclude: ["**/__tests__/**", "videos/lib/record-*"],
      reporter: ["text", "lcov"],
      // Floors just under the measured baseline (2026-11-08: 75.7 / 70.9 / 75.0 / 78.6, after
      // excluding the video capture scripts), so a drop fails CI (#317). Raise them as coverage
      // grows; never lower them to make CI pass.
      thresholds: { statements: 70, branches: 65, functions: 70, lines: 73 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
