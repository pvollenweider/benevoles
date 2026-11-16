// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * End-to-end tests only: the second factor of the seeded super admin (pentest F6), so the specs
 * that sign in as the super admin can pass the second step (e2e/helpers/super-admin.ts).
 *
 *   npx tsx scripts/e2e-super-admin-totp.ts code <email>    enrols the account if needed (random
 *       secret, encrypted like the app does), forgets the last step used and the failure budget,
 *       prints a current code
 *   npx tsx scripts/e2e-super-admin-totp.ts reset <email>   clears the factor and its failure budget
 *       (the enrolment spec)
 *
 * Forgetting the last step lets unrelated specs sign in one after the other within the same 30 s
 * (the specs that test replay protection never call it). Refuses any database that isn't a local
 * end-to-end one, and any account that isn't a super admin. Run as a child process: Playwright's
 * transform can't load Prisma's generated client (see scripts/e2e-seed-release-check.ts).
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { pgAdapter } from "../src/lib/prisma-adapter"
import { decryptValue, encryptValue } from "../src/lib/token-vault"
import { base32Decode, generateTotpSecret, totp } from "../src/lib/totp"

function assertDisposableDatabase(raw: string | undefined): string {
  if (!raw) throw new Error("DATABASE_URL is required")
  const url = new URL(raw)
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (!local || !url.pathname.replace(/^\//, "").endsWith("_e2e")) {
    throw new Error("Refusing: this script only runs against a local end-to-end database (host localhost, name ending in _e2e)")
  }
  return raw
}

const prisma = new PrismaClient({ adapter: pgAdapter(assertDisposableDatabase(process.env.DATABASE_URL)) })

async function main() {
  const [cmd, email] = process.argv.slice(2)
  if (!email || (cmd !== "code" && cmd !== "reset")) throw new Error("Usage: e2e-super-admin-totp.ts code|reset <email>")
  const admin = await prisma.adminUser.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, role: true, totpSecretEnc: true } })
  if (!admin || admin.role !== "super_admin") throw new Error(`${email} is not a super admin of this database`)

  if (cmd === "reset") {
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastUsedStep: null } }),
      prisma.adminRecoveryCode.deleteMany({ where: { adminUserId: admin.id } }),
      // The wrong codes of earlier runs: the spec that resets starts with a fresh budget.
      prisma.rateLimit.deleteMany({ where: { key: `second-factor-account:${admin.id}` } }),
    ])
    return
  }

  let secret = admin.totpSecretEnc ? decryptValue(admin.totpSecretEnc) : null
  if (!secret) {
    secret = generateTotpSecret()
    const enc = encryptValue(secret)
    if (!enc) throw new Error("TOKEN_ENCRYPTION_KEY is required (see e2e/e2e.env.example)")
    await prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecretEnc: enc, totpEnabledAt: new Date(), totpPendingSecretEnc: null } })
  }
  await prisma.adminUser.update({ where: { id: admin.id }, data: { totpLastUsedStep: null } })
  await prisma.rateLimit.deleteMany({ where: { key: `second-factor-account:${admin.id}` } })
  process.stdout.write(`${totp(base32Decode(secret), Date.now())}\n`)
}

main().finally(() => prisma.$disconnect())
