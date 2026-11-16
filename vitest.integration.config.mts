import { defineConfig } from "vitest/config"
import path from "path"

// Tests against a real Postgres (DATABASE_URL), run by the E2E job in CI (#318, #319):
// `npm run test:integration`. Kept out of the unit suite, which runs without a database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__integration__/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // next-auth imports `next/server` without an extension, which Node's ESM resolver refuses;
    // inlined, Vite resolves it (src/__integration__/session-revocation.int.test.ts).
    server: { deps: { inline: ["next-auth"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
