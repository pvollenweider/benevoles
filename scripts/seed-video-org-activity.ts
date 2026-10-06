// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient } from "../src/generated/prisma/client"

/** Isolated multi-admin classroom; never rename or change the active demo team's permissions. */
export async function seedVideoOrgActivity(db: PrismaClient) {
  const id = "video-org-activity"
  const slug = "formation-journal"
  const existing = await db.organization.findUnique({ where: { id }, select: { slug: true, name: true } })
  if (existing && (existing.slug !== slug || existing.name !== "Formation — journal d'organisation")) throw new Error("Organization namespace is not the recorder-owned fixture")
  const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
  // Exact dedicated organization only; these synthetic accounts have no production counterpart.
  await db.volunteer.deleteMany({ where: { organizationId: id } })
  await db.adminUser.deleteMany({ where: { organizationId: id } })
  await db.organization.deleteMany({ where: { id, slug } })
  await db.organization.create({ data: { id, slug, name: "Formation — journal d'organisation", timeZone: "Europe/Zurich", active: true } })
  await db.adminUser.createMany({ data: [
    { id: "video-org-activity-owner", organizationId: id, name: "Colette Exemple", email: "video.org-activity.owner@example.org", passwordHash: source.passwordHash, role: "admin", isActive: true },
    { id: "video-org-activity-organizer", organizationId: id, name: "Samira Exemple", email: "video.org-activity.organizer@example.org", passwordHash: source.passwordHash, role: "organizer", isActive: true },
  ] })
  if (await db.adminUser.count({ where: { organizationId: id } }) !== 2 || await db.orgLog.count({ where: { organizationId: id } })) throw new Error("Two separate fixture actors and no fabricated journal required")
  console.log("✓ Isolated organization-activity classroom: two fictitious admins, separate roles, no invented activity; active demonstration organization unchanged")
}
