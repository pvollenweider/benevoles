// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Break-glass reset of a super admin's second factor (pentest F6): phone lost and no recovery
 * code left. Whoever can run this has database access, which already means full authority over
 * the platform; the procedure is in docs/double-authentification.md.
 *
 * Dry run by default, touches nothing:
 *   DATABASE_URL=… npx tsx scripts/reset-two-factor.ts <email>
 * Apply:
 *   DATABASE_URL=… npx tsx scripts/reset-two-factor.ts <email> --yes
 *
 * Applying clears the secret, any pending enrolment, the replay state and every recovery code,
 * and ends the account's sessions, in one transaction. The next sign-in asks to enrol again. An
 * operator alert says it happened (no personal data in it).
 */

import { prisma } from "../src/lib/prisma"
import { resetSecondFactor } from "../src/lib/second-factor-server"

async function main() {
  const args = process.argv.slice(2)
  const email = args.find((a) => !a.startsWith("--"))
  const yes = args.includes("--yes")
  const unknown = args.filter((a) => a.startsWith("--") && a !== "--yes")
  if (!email || unknown.length > 0) {
    console.error("Usage: npx tsx scripts/reset-two-factor.ts <email> [--yes]")
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.")
    process.exit(1)
  }

  try {
    const admin = await prisma.adminUser.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true, email: true, role: true, totpEnabledAt: true, _count: { select: { recoveryCodes: { where: { usedAt: null } } } } },
    })
    if (!admin) {
      console.error(`No account with the address ${email}.`)
      process.exit(2)
    }
    if (admin.role !== "super_admin") {
      console.error(`${admin.email} is not a super admin: nothing to reset.`)
      process.exit(2)
    }
    const state = admin.totpEnabledAt ? `enrolled on ${admin.totpEnabledAt.toISOString()}, ${admin._count.recoveryCodes} recovery code(s) left` : "not enrolled"
    if (!yes) {
      console.log(`Dry run. ${admin.email}: second factor ${state}.`)
      console.log("Run again with --yes to reset it and end the account's sessions.")
      return
    }
    const outcome = await resetSecondFactor(admin.email, Date.now())
    if (!outcome.ok) {
      console.error(`Not reset: ${outcome.reason}.`)
      process.exit(2)
    }
    console.log(`Second factor of ${outcome.email} reset (was: ${state}). Its sessions are ended; the next sign-in enrols again.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
