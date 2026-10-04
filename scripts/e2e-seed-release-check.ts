// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Seeds (or clears) the ReleaseCheckState singleton row for e2e/release-banner.spec.ts (#612),
 * so that spec doesn't depend on GitHub being reachable. Run with DATABASE_URL set:
 *
 *   npx tsx scripts/e2e-seed-release-check.ts seed v999.0.0 https://github.com/x/releases/tag/v999.0.0
 *   npx tsx scripts/e2e-seed-release-check.ts clear
 *
 * Invoked from the Playwright spec via a child process (Prisma's generated client is ESM-only —
 * `import.meta` — and Playwright's own test transform can't load it directly).
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const [cmd, latestVersion, releaseUrl] = process.argv.slice(2)
  if (cmd === "seed") {
    await prisma.releaseCheckState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", latestVersion, releaseUrl, lastCheckedAt: new Date() },
      update: { latestVersion, releaseUrl, lastCheckedAt: new Date() },
    })
  } else if (cmd === "clear") {
    await prisma.releaseCheckState.deleteMany({ where: { id: "singleton" } })
  } else if (cmd === "reset-dismissed") {
    await prisma.adminUser.updateMany({ where: { email: process.argv[3] }, data: { releaseBannerDismissedVersion: null } })
  } else {
    throw new Error(`Unknown command: ${cmd}`)
  }
}

main().finally(() => prisma.$disconnect())
