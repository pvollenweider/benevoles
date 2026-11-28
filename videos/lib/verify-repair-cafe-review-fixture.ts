// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { surnameOf } from "./fixture-names"

/**
 * Check the complete dedicated organisation of scripts/seed-video-repair-cafe.ts before the
 * rendered pixels of RECURRING_PRESENTATION are sent for review: only its synthetic organiser,
 * its members and Sarah, who signs up during the take (example.org, cast names, no phone), and the
 * one season the take creates from the « Repair café » template.
 */
export async function verifyRepairCafeReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname === "/benevoles_video", "Isolated local video database required")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-repair" }, include: { admins: true, volunteers: true, events: { include: { registrations: true } } } })
  assert(org.slug === "repair-cafe-montvert" && org.name === "Repair Café de Montvert")
  assert(org.admins.length === 1 && org.admins[0].id === "video-repair-owner" && org.admins[0].email === "video.repair.owner@example.org")
  assert(org.volunteers.length <= 4 && org.volunteers.every(v => /^video\.repair\.[a-z]+@example\.org$/.test(v.email ?? "") && v.lastName === surnameOf(v.firstName) && !v.phone))
  assert(org.events.length === 1, "Exactly the season created by the take")
  assert(org.events[0].registrations.every(r => org.volunteers.some(v => v.id === r.volunteerId)))
}
