// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * #1415 against a real Postgres: "Registration"."createdAt" is a timestamp WITHOUT time zone
 * holding UTC (prisma/migrations/0001_init). The busiest-hour aggregate must read it as UTC first,
 * then convert it to APP_TIME_ZONE; reading it directly as Zurich local time put a 10:00 UTC
 * summer registration in the 08 h bucket instead of 12 h. This test pins the real query, not just
 * its shape (see src/lib/__tests__/operator-activity-data.test.ts for the SQL shape).
 */

import { prisma } from "@/lib/prisma"
import { loadOperatorActivity } from "@/lib/operator-activity-data"
import { APP_TIME_ZONE } from "@/lib/time-zone"

const url = process.env.DATABASE_URL
const tag = `int-operator-activity-${Date.now()}`
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe.skipIf(!url || APP_TIME_ZONE !== "Europe/Zurich")("operator activity busiest hour (#1415)", () => {
  let organizationId = ""
  let volunteerId = ""

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })
    organizationId = organization.id
    const event = await prisma.event.create({
      data: {
        organizationId,
        slug: `${tag}-fete`,
        title: "Fête de test",
        startDate: day("2020-07-15"),
        endDate: day("2020-07-15"),
      },
    })
    const shift = await prisma.shift.create({
      data: { eventId: event.id, roleName: "Bar", label: "Bar", date: day("2020-07-15"), startTime: "10:00", endTime: "12:00", capacity: 5 },
    })
    const volunteer = await prisma.volunteer.create({ data: { organizationId, firstName: "Léa", lastName: "Test" } })
    volunteerId = volunteer.id
    await prisma.registration.create({
      data: {
        eventId: event.id,
        shiftId: shift.id,
        volunteerId,
        createdAt: new Date("2020-07-15T10:00:00Z"),
        editTokenHash: `${tag}-token`,
      },
    })
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } })
    await prisma.volunteer.deleteMany({ where: { id: volunteerId } })
  })

  it("puts a 10:00 UTC registration in summer in the 12 h Zurich bucket", async () => {
    const activity = await loadOperatorActivity(new Date("2020-07-20T12:00:00Z"))
    expect(activity.activity.busiestHour).toEqual({ hour: "2020-07-15T12", count: 1 })
  })
})
