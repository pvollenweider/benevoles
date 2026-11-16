// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The default organization's organizer was seeded as org-admin@localhost, which the videos showed.
 * Renames that account to VIDEO_ADMIN_EMAIL in the isolated video database, once; idempotent.
 */
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { PrismaClient } from "../../src/generated/prisma/client"
import { LEGACY_VIDEO_ADMIN_EMAIL, VIDEO_ADMIN_EMAIL } from "../lib/public-hosts"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Only the isolated local video database can be changed")
  const db = new PrismaClient({ adapter: pgAdapter(url.href) })
  try {
    const legacy = await db.adminUser.findUnique({ where: { email: LEGACY_VIDEO_ADMIN_EMAIL }, select: { id: true, organizationId: true, role: true, name: true } })
    const current = await db.adminUser.findUnique({ where: { email: VIDEO_ADMIN_EMAIL }, select: { id: true, organizationId: true, role: true, name: true } })
    if (!legacy) {
      console.log(current ? `Video organizer already ${VIDEO_ADMIN_EMAIL}` : "No legacy video organizer to rename")
      return
    }
    if (legacy.organizationId !== "default") throw new Error("The legacy organizer is not in the default organization")
    if (current) {
      if (!process.argv.includes("--remove-owned-duplicate") || url.port !== "45433") throw new Error(`Both ${LEGACY_VIDEO_ADMIN_EMAIL} and ${VIDEO_ADMIN_EMAIL} exist: explicit owned-duplicate cleanup required`)
      const org = await db.organization.findUniqueOrThrow({ where: { id: "default" } })
      if (org.name !== "Fêtes de Montvert" || current.organizationId !== "default" || current.role !== "admin" || legacy.role !== "admin" || legacy.name !== "Administrateur (org par défaut)" || current.name !== "Élodie Rochat") throw new Error("Duplicate accounts do not match the exact synthetic seed owners")
      const removed = await db.adminUser.deleteMany({ where: { id: legacy.id, email: LEGACY_VIDEO_ADMIN_EMAIL, organizationId: "default", role: "admin", name: "Administrateur (org par défaut)" } })
      if (removed.count !== 1) throw new Error("Exact synthetic legacy account changed before cleanup")
      console.log("Removed only the duplicate localhost owner created by the initial synthetic seed; current realistic owner retained")
      return
    }
    await db.adminUser.update({ where: { id: legacy.id }, data: { email: VIDEO_ADMIN_EMAIL } })
    console.log(`Video organizer renamed to ${VIDEO_ADMIN_EMAIL}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Video organizer rename failed"); process.exitCode = 1 })
