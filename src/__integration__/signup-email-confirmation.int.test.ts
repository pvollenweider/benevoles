// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"
import { confirmSignupConfirmation, expireSignupConfirmations } from "@/lib/signup-confirmation-server"
import { promoteNextInWaitlist } from "@/lib/waitlist"

/**
 * Confirmation by email against a real Postgres (#1253): the race between the click and the
 * expiration cron, and a late link that never takes back a place offered to someone else. The
 * transactions lock the shift, so exactly one of the two writes the provisional place.
 */

const url = process.env.DATABASE_URL
const tag = `int-signup-confirm-${Date.now()}`
const TZ = "Europe/Zurich"

describe.skipIf(!url)("signup confirmation by email on Postgres (#1253)", () => {
  let orgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({
      data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ, publicationApprovedAt: new Date() },
    })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  async function event() {
    return prisma.event.create({
      data: {
        organizationId: orgId, slug: `${tag}-e${n++}`, title: "Fête", publicStatus: "published",
        startDate: new Date("2031-07-03"), endDate: new Date("2031-07-08"),
        requireEmailConfirmation: true,
      },
    })
  }

  async function shift(eventId: string, over: { capacity?: number; waitlistEnabled?: boolean } = {}) {
    return prisma.shift.create({
      data: {
        eventId, roleName: "Accueil", label: "Accueil", date: new Date("2031-07-04T00:00:00Z"),
        startTime: "10:00", endTime: "12:00", capacity: over.capacity ?? 1, waitlistEnabled: over.waitlistEnabled ?? true,
      },
    })
  }

  async function volunteer(email: string) {
    return prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Léa", lastName: "M", email } })
  }

  async function pending(eventId: string, shiftId: string, volunteerId: string, email: string, token: string, expiresAt: Date) {
    const confirmation = await prisma.signupConfirmation.create({
      data: {
        eventId, volunteerId, email, firstName: "Léa", lastName: "M", tokenHash: hashToken(token), expiresAt,
        charterAcceptedHash: "hash", charterAcceptedAt: new Date(), waitlistShiftIds: [],
      },
    })
    const registration = await prisma.registration.create({
      data: {
        eventId, shiftId, volunteerId, status: "unconfirmed", signupConfirmationId: confirmation.id,
        ...registrationToken.data(generateToken()),
      },
    })
    return { confirmation, registration }
  }

  it("the click and the expiration race: exactly one wins, never both", async () => {
    const e = await event()
    const s = await shift(e.id)
    const v = await volunteer(`${tag}-race@example.org`)
    const expiresAt = new Date(Date.now() + 60_000)
    const token = "race-token"
    const { confirmation, registration } = await pending(e.id, s.id, v.id, v.email!, token, expiresAt)

    const before = new Date(expiresAt.getTime() - 1)
    const after = new Date(expiresAt.getTime() + 1)
    await Promise.allSettled([
      confirmSignupConfirmation(token, before),
      expireSignupConfirmations(after),
    ])

    const [row, reg] = await Promise.all([
      prisma.signupConfirmation.findUniqueOrThrow({ where: { id: confirmation.id } }),
      prisma.registration.findUniqueOrThrow({ where: { id: registration.id } }),
    ])
    const confirmed = row.confirmedAt != null
    const expired = row.cancelledAt != null && row.cancelReason === "expired"
    expect(confirmed !== expired).toBe(true)
    expect(reg.status).toBe(confirmed ? "active" : "cancelled")
    if (confirmed) {
      expect(row.resultActive).toBe(1)
      expect(reg.signupConfirmationId).toBe(confirmation.id)
    }
  })

  it("a late link never takes back a place offered to the next person", async () => {
    const e = await event()
    const s = await shift(e.id)
    const first = await volunteer(`${tag}-first@example.org`)
    const next = await volunteer(`${tag}-next@example.org`)
    const expiresAt = new Date(Date.now() - 1)
    const token = "late-token"
    const { confirmation, registration } = await pending(e.id, s.id, first.id, first.email!, token, expiresAt)
    await prisma.registration.create({
      data: {
        eventId: e.id, shiftId: s.id, volunteerId: next.id, status: "waiting", waitingPosition: 1,
        ...registrationToken.data(generateToken()),
      },
    })

    // The cron frees the expired place, then offers it to the person waiting.
    await expireSignupConfirmations(new Date())
    await promoteNextInWaitlist(s.id)

    const late = await confirmSignupConfirmation(token, new Date())
    expect(late).toEqual({ ok: false, reason: "expired" })

    const [mine, theirs, row] = await Promise.all([
      prisma.registration.findUniqueOrThrow({ where: { id: registration.id } }),
      prisma.registration.findFirstOrThrow({ where: { shiftId: s.id, volunteerId: next.id } }),
      prisma.signupConfirmation.findUniqueOrThrow({ where: { id: confirmation.id } }),
    ])
    expect(mine.status).toBe("cancelled")
    expect(theirs.status).toBe("offered")
    expect(row.confirmedAt).toBeNull()
    expect(row.cancelReason).toBe("expired")
  })
})
