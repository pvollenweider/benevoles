// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The administrator-email trace of an organisation's page, against a real Postgres. The window
 * straddles the March 2026 switch to summer time, so one query proves both offsets: 23:30 UTC in
 * winter is already the next Zurich day, while 22:30 UTC in summer is already the next one too.
 * It also pins the whole-day window bound (a row two hours before `now - 30 days` but on the
 * oldest Zurich day is kept) and the filters: administrator kinds only, this organisation only.
 */

import { prisma } from "@/lib/prisma"
import { loadAdminEmails } from "@/lib/admin-emails-data"
import { APP_TIME_ZONE } from "@/lib/time-zone"

const url = process.env.DATABASE_URL
const tag = `int-admin-emails-${Date.now()}`
const now = new Date("2026-04-15T12:00:00Z")

describe.skipIf(!url || APP_TIME_ZONE !== "Europe/Zurich")("administrator emails of an organisation", () => {
  let organizationId = ""
  let otherOrganizationId = ""

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })
    organizationId = organization.id
    const other = await prisma.organization.create({ data: { name: `Autre ${tag}`, slug: `${tag}-autre`, timeZone: "Europe/Zurich" } })
    otherOrganizationId = other.id

    await prisma.deliveryOutcome.createMany({
      data: [
        // Just before the window's local midnight (15 March 23:00 UTC): 23:30 in Zurich.
        { organizationId, kind: "admin_invite", outcome: "accepted_by_relay", createdAt: new Date("2026-03-15T22:30:00Z") },
        // Before `now - 30 days` (16 March 12:00 UTC) but on the window's oldest Zurich day, after
        // its midnight: the oldest day is shown whole.
        { organizationId, kind: "admin_invite", outcome: "accepted_by_relay", createdAt: new Date("2026-03-16T10:00:00Z") },
        // Winter day: 22:30 is still 20 March in Zurich, 23:30 is already 21 March.
        { organizationId, kind: "admin_notification", outcome: "accepted_by_relay", createdAt: new Date("2026-03-20T22:30:00Z") },
        { organizationId, kind: "admin_notification", outcome: "accepted_by_relay", createdAt: new Date("2026-03-20T23:30:00Z") },
        // Same kind and day: accepted, refused for good, failed temporarily.
        { organizationId, kind: "space_approved", outcome: "accepted_by_relay", createdAt: new Date("2026-03-20T10:00:00Z") },
        { organizationId, kind: "space_approved", outcome: "rejected_permanent", createdAt: new Date("2026-03-20T11:00:00Z") },
        { organizationId, kind: "space_approved", outcome: "failed_temporary", createdAt: new Date("2026-03-20T12:00:00Z") },
        // Summer day (UTC+2): 21:30 is still 10 April in Zurich, 22:30 is already 11 April.
        { organizationId, kind: "admin_notification", outcome: "accepted_by_relay", createdAt: new Date("2026-04-10T21:30:00Z") },
        { organizationId, kind: "admin_notification", outcome: "accepted_by_relay", createdAt: new Date("2026-04-10T22:30:00Z") },
        // A kind addressed to volunteers: never counted here.
        { organizationId, kind: "registration_confirmation", outcome: "accepted_by_relay", createdAt: new Date("2026-03-20T09:00:00Z") },
        // Older than the window.
        { organizationId, kind: "admin_notification", outcome: "accepted_by_relay", createdAt: new Date("2026-03-01T12:00:00Z") },
        // Another organisation.
        { organizationId: otherOrganizationId, kind: "admin_notification", outcome: "accepted_by_relay", createdAt: new Date("2026-03-20T10:00:00Z") },
      ],
    })
  })

  afterAll(async () => {
    await prisma.deliveryOutcome.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } })
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } })
    await prisma.$disconnect()
  })

  it("groups by Zurich day and kind, counts outcomes, and applies the window and filters", async () => {
    expect(await loadAdminEmails({ organizationId, now })).toEqual({
      rows: [
        { day: "2026-04-11", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 1, failed: 0 },
        { day: "2026-04-10", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 1, failed: 0 },
        { day: "2026-03-21", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 1, failed: 0 },
        { day: "2026-03-20", kind: "space_approved", kindLabel: "Espace activé", accepted: 1, failed: 2 },
        { day: "2026-03-20", kind: "admin_notification", kindLabel: "Notification à l'équipe", accepted: 1, failed: 0 },
        { day: "2026-03-16", kind: "admin_invite", kindLabel: "Invitation d'un organisateur", accepted: 1, failed: 0 },
      ],
      truncated: false,
      total: 6,
    })
  })
})
